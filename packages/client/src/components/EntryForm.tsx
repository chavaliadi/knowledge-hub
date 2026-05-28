import { useState, useEffect } from 'react';
import { Entry, Tag, EntryType } from '../lib/types';
import { X, FileText, Bookmark, Code, Lightbulb, Globe, Plus } from 'lucide-react';
import TagBadge from './TagBadge';

interface EntryFormProps {
  entry?: Entry | null; // If present, we are editing
  tags: Tag[];
  onSave: (data: { title: string; content: string; type: EntryType; url: string; tag_ids: string[] }) => void;
  onClose: () => void;
  onCreateTag: (name: string) => Promise<Tag>;
}

export default function EntryForm({
  entry,
  tags,
  onSave,
  onClose,
  onCreateTag
}: EntryFormProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EntryType>('note');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  
  const [newTagName, setNewTagName] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [error, setError] = useState('');

  // Populate form if editing
  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setType(entry.type);
      setContent(entry.content || '');
      setUrl(entry.url || '');
      setSelectedTagIds(entry.tags.map((t) => t.id));
    } else {
      setTitle('');
      setType('note');
      setContent('');
      setUrl('');
      setSelectedTagIds([]);
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
      tag_ids: selectedTagIds
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
