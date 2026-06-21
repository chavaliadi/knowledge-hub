import { useState, useEffect } from 'react';
import { Entry, Tag, EntryType, Collection } from '../lib/types';
import { X, FileText, Bookmark, Code, Lightbulb, Globe, Plus, UploadCloud, File, Trash, Loader2 } from 'lucide-react';
import TagBadge from './TagBadge';
import { supabase } from '../lib/supabase';

interface EntryFormProps {
  entry?: Entry | null; // If present, we are editing
  tags: Tag[];
  collections: Collection[];
  onSave: (data: { 
    title: string; 
    content: string; 
    type: EntryType; 
    url: string; 
    tag_ids: string[];
    collection_id?: string | null;
    is_pinned?: boolean;
    attachments?: any[];
  }) => void;
  onClose: () => void;
  onCreateTag: (name: string) => Promise<Tag>;
}

export default function EntryForm({
  entry,
  tags,
  collections = [],
  onSave,
  onClose,
  onCreateTag
}: EntryFormProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EntryType>('note');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  
  const [newTagName, setNewTagName] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [error, setError] = useState('');

  const [attachments, setAttachments] = useState<{ id: string; name: string; size: number; mimeType: string; progress: number; status: 'uploading' | 'completed' | 'failed'; file_path?: string }[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  // Populate form if editing
  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setType(entry.type);
      setContent(entry.content || '');
      setUrl(entry.url || '');
      setSelectedTagIds(entry.tags.map((t) => t.id));
      setCollectionId(entry.collection_id || null);
      setIsPinned(entry.is_pinned || false);
      if (entry.attachments) {
        setAttachments(entry.attachments.map(att => ({
          id: att.id,
          name: att.file_name,
          size: att.file_size,
          mimeType: att.mime_type,
          progress: 100,
          status: 'completed',
          file_path: att.file_path
        })));
      } else {
        setAttachments([]);
      }
    } else {
      setTitle('');
      setType('note');
      setContent('');
      setUrl('');
      setSelectedTagIds([]);
      setCollectionId(null);
      setIsPinned(false);
      setAttachments([]);
    }
    setError('');
  }, [entry]);

  const handleToggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
  };

  const handleCreateTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTagName.trim()) {
      try {
        const created = await onCreateTag(newTagName.trim());
        if (!selectedTagIds.includes(created.id)) {
          setSelectedTagIds([...selectedTagIds, created.id]);
        }
        setNewTagName('');
        setShowAddTag(false);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = async (files: File[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      setError('You must be logged in to upload files.');
      return;
    }

    files.forEach(async (file) => {
      const fileId = Math.random().toString(36).substring(7);
      const newAtt = {
        id: fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        progress: 0,
        status: 'uploading' as const
      };
      setAttachments(prev => [...prev, newAtt]);

      try {
        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        const filePath = `${userId}/${uniqueFileName}`;

        // Simulated progressive upload state transitions
        let progress = 10;
        const progressInterval = setInterval(() => {
          progress += 10;
          if (progress >= 90) {
            clearInterval(progressInterval);
          } else {
            setAttachments(prev => prev.map(att => 
              att.id === fileId ? { ...att, progress } : att
            ));
          }
        }, 100);

        const { data, error: uploadError } = await supabase.storage
          .from('Knowledge-Hub')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        clearInterval(progressInterval);

        if (uploadError) {
          throw uploadError;
        }

        setAttachments(prev => prev.map(att => 
          att.id === fileId 
            ? { ...att, progress: 100, status: 'completed', file_path: data.path } 
            : att
        ));
      } catch (err: any) {
        console.error('File upload failed:', err);
        setAttachments(prev => prev.map(att => 
          att.id === fileId 
            ? { ...att, status: 'failed' } 
            : att
        ));
      }
    });
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    if (type === 'bookmark' && !url.trim()) {
      setError('URL is required for bookmarks.');
      return;
    }

    onSave({
      title: title.trim(),
      content: content.trim(),
      type,
      url: type === 'bookmark' ? url.trim() : '',
      tag_ids: selectedTagIds,
      collection_id: collectionId,
      is_pinned: isPinned,
      attachments: attachments
        .filter(att => att.status === 'completed' && att.file_path)
        .map(att => ({
          file_name: att.name,
          file_size: att.size,
          mime_type: att.mimeType,
          file_path: att.file_path!
        }))
    });
  };

  const typesList: { value: EntryType; label: string; icon: React.ReactNode }[] = [
    { value: 'note', label: 'Note', icon: <FileText size={14} /> },
    { value: 'bookmark', label: 'Bookmark', icon: <Bookmark size={14} /> },
    { value: 'snippet', label: 'Snippet', icon: <Code size={14} /> },
    { value: 'idea', label: 'Project Idea', icon: <Lightbulb size={14} /> },
    { value: 'resource', label: 'Resource', icon: <Globe size={14} /> }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-sm">
      {/* Modal backdrop click */}
      <div className="absolute inset-0 cursor-default" onClick={onClose}></div>

      {/* Modal Card */}
      <div className="glass-card w-full max-w-lg relative z-10 flex flex-col max-h-[90vh] shadow-2xl border-brand-border/60 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-brand-border/40">
          <h2 className="text-base font-bold text-brand-textMain">
            {entry ? 'Edit Saved Knowledge' : 'Save New Knowledge'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-brand-border/40 text-brand-textMuted hover:text-brand-textMain transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Redis Queue Architecture"
              className="block w-full bg-brand-dark border border-brand-border px-3 py-2.5 rounded-xl text-sm text-brand-textMain placeholder-brand-textMuted/40 focus:outline-none focus:border-brand-accent/50 focus:bg-brand-dark/80 transition-all font-medium"
              autoFocus
            />
          </div>

          {/* Type Selector (custom pills) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {typesList.map((t) => {
                const isSelected = type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 rounded-xl border text-[11px] font-semibold transition-all select-none
                      ${isSelected
                        ? 'bg-brand-accent/10 border-brand-accent/50 text-brand-accentLight shadow-inner shadow-brand-accent/5'
                        : 'bg-brand-dark/40 border-brand-border/40 text-brand-textMuted hover:border-brand-border hover:bg-brand-dark/80 hover:text-brand-textMain'
                      }
                    `}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* URL Input (only shown for bookmarks) */}
          {type === 'bookmark' && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-150">
              <label className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">URL *</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="block w-full bg-brand-dark border border-brand-border px-3 py-2.5 rounded-xl text-sm text-brand-textMain placeholder-brand-textMuted/40 focus:outline-none focus:border-brand-accent/50 focus:bg-brand-dark/80 transition-all font-medium"
              />
            </div>
          )}

          {/* Content (Textarea) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">
              {type === 'snippet' ? 'Code Snippet *' : 'Notes / Content'}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={type === 'snippet' ? 'paste code here...' : 'write notes or summary...'}
              rows={type === 'snippet' ? 6 : 4}
              className="block w-full bg-brand-dark border border-brand-border px-3 py-2.5 rounded-xl text-sm text-brand-textMain placeholder-brand-textMuted/40 focus:outline-none focus:border-brand-accent/50 focus:bg-brand-dark/80 transition-all font-mono font-medium"
            />
          </div>

          {/* Collection Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">Collection</label>
            <select
              value={collectionId || ''}
              onChange={(e) => setCollectionId(e.target.value || null)}
              className="block w-full bg-brand-dark border border-brand-border px-3 py-2.5 rounded-xl text-sm text-brand-textMain placeholder-brand-textMuted/40 focus:outline-none focus:border-brand-accent/50 focus:bg-brand-dark/80 transition-all font-medium"
            >
              <option value="">No Collection</option>
              {collections.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          {/* Pin to top Checkbox */}
          <div className="flex items-center gap-2.5 py-1 select-none">
            <input
              type="checkbox"
              id="isPinned"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="rounded bg-brand-dark border-brand-border text-brand-accent focus:ring-brand-accent/50 h-4 w-4"
            />
            <label 
              htmlFor="isPinned" 
              className="text-xs font-bold text-brand-textMuted uppercase tracking-wider cursor-pointer"
            >
              Pin to top
            </label>
          </div>

          {/* File Attachments Dropzone */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">Attachments</label>
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-all cursor-pointer bg-brand-dark/20
                ${isDragActive 
                  ? 'border-brand-accent bg-brand-accent/5 scale-[1.01]' 
                  : 'border-brand-border/60 hover:border-brand-accent/40'
                }
              `}
            >
              <input
                type="file"
                multiple
                onChange={handleFileInputChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <UploadCloud size={28} className={`mb-2 transition-colors ${isDragActive ? 'text-brand-accentLight' : 'text-brand-textMuted'}`} />
              <p className="text-xs font-semibold text-brand-textMain text-center">
                Drag and drop files here, or <span className="text-brand-accentLight hover:underline">browse</span>
              </p>
              <p className="text-[10px] text-brand-textMuted/65 mt-1">PDFs, images (Max 10MB)</p>
            </div>

            {/* Attachments List */}
            {attachments.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto mt-2 p-1">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center justify-between p-2.5 rounded-xl bg-brand-dark/40 border border-brand-border/40 text-xs font-medium">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <File size={16} className="text-brand-textMuted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-brand-textMain truncate font-semibold">{att.name}</p>
                        <p className="text-[9px] text-brand-textMuted/70 font-semibold mt-0.5">
                          {(att.size / 1024 / 1024).toFixed(2)} MB · {att.status}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {att.status === 'uploading' && (
                        <div className="flex items-center gap-1.5 text-brand-accentLight font-bold">
                          <Loader2 size={12} className="animate-spin" />
                          <span className="text-[10px]">{att.progress}%</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="p-1 rounded hover:bg-brand-border/40 text-brand-textMuted hover:text-red-400 transition-colors"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags Manager */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-brand-textMuted uppercase tracking-wider">Tags</label>
              <button
                type="button"
                onClick={() => setShowAddTag(!showAddTag)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-accentLight hover:underline"
              >
                <Plus size={12} />
                <span>Create Tag</span>
              </button>
            </div>

            {/* Create inline tag input */}
            {showAddTag && (
              <div className="flex gap-1.5 p-3 rounded-xl bg-brand-dark/50 border border-brand-border/40 animate-in slide-in-from-top-1 duration-150">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g. backend"
                  className="flex-1 bg-brand-dark border border-brand-border px-2.5 py-1.5 rounded-lg text-xs text-brand-textMain focus:outline-none focus:border-brand-accent/50"
                />
                <button
                  type="button"
                  onClick={handleCreateTagSubmit}
                  className="px-3 py-1.5 bg-brand-accent hover:bg-brand-accentLight text-white rounded-lg text-xs font-bold"
                >
                  Create
                </button>
              </div>
            )}

            {/* Tags Badges Picker */}
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-brand-dark/20 border border-brand-border/20 rounded-xl">
              {tags.length === 0 ? (
                <span className="text-xs text-brand-textMuted/40 italic p-1 select-none">No tags available. Create one above!</span>
              ) : (
                tags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <TagBadge
                      key={tag.id}
                      tag={tag}
                      onClick={() => handleToggleTag(tag.id)}
                      active={isSelected}
                    />
                  );
                })
              )}
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-brand-border/40 bg-brand-card/25">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-brand-border text-sm text-brand-textMuted hover:text-brand-textMain hover:bg-brand-card rounded-xl font-semibold transition-all select-none"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 hover:scale-[1.01] transition-all select-none"
          >
            {entry ? 'Save Changes' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
