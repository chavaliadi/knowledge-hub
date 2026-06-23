import { useState, useEffect } from 'react';
import { Entry } from '../lib/types';
import {
  FileText, Bookmark, Code, Lightbulb, Globe,
  Star, Edit, Trash2, X, ExternalLink, Calendar, Clock, Tag, Folder,
  Paperclip, Download, Eye, Loader2, Sparkles
} from 'lucide-react';
import TagBadge from './TagBadge';
import { supabase } from '../lib/supabase';

interface EntryDetailProps {
  entry: Entry;
  onClose: () => void;
  onEdit: (entry: Entry) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTagClick?: (tagName: string) => void;
}

const typeConfig = {
  note: {
    icon: (s: number) => <FileText size={s} className="text-entry-note" />,
    label: 'Note',
    color: 'text-entry-note',
    bg: 'bg-entry-note/10',
    border: 'border-entry-note/25',
    bar: 'bg-entry-note',
  },
  bookmark: {
    icon: (s: number) => <Bookmark size={s} className="text-entry-bookmark" />,
    label: 'Bookmark',
    color: 'text-entry-bookmark',
    bg: 'bg-entry-bookmark/10',
    border: 'border-entry-bookmark/25',
    bar: 'bg-entry-bookmark',
  },
  snippet: {
    icon: (s: number) => <Code size={s} className="text-entry-snippet" />,
    label: 'Code Snippet',
    color: 'text-entry-snippet',
    bg: 'bg-entry-snippet/10',
    border: 'border-entry-snippet/25',
    bar: 'bg-entry-snippet',
  },
  idea: {
    icon: (s: number) => <Lightbulb size={s} className="text-entry-idea" />,
    label: 'Project Idea',
    color: 'text-entry-idea',
    bg: 'bg-entry-idea/10',
    border: 'border-entry-idea/25',
    bar: 'bg-entry-idea',
  },
  resource: {
    icon: (s: number) => <Globe size={s} className="text-entry-resource" />,
    label: 'Resource',
    color: 'text-entry-resource',
    bg: 'bg-entry-resource/10',
    border: 'border-entry-resource/25',
    bar: 'bg-entry-resource',
  },
};

export default function EntryDetail({
  entry,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTagClick,
}: EntryDetailProps) {
  const cfg = typeConfig[entry.type];
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignedUrls = async () => {
      if (!entry.attachments || entry.attachments.length === 0) return;
      const urls: Record<string, string> = {};
      for (const att of entry.attachments) {
        try {
          const { data } = await supabase.storage
            .from('Knowledge-Hub')
            .createSignedUrl(att.file_path, 300); // 5 minutes validity
          if (data?.signedUrl) {
            urls[att.id] = data.signedUrl;
          }
        } catch (err) {
          console.error('Failed to create signed URL for attachment:', att.id, err);
        }
      }
      setSignedUrls(urls);

      // Auto-set the first PDF as the active preview
      const firstPdf = entry.attachments.find(att => att.mime_type === 'application/pdf' || att.file_name.endsWith('.pdf'));
      if (firstPdf && urls[firstPdf.id]) {
        setActivePdfUrl(urls[firstPdf.id]);
      }
    };

    fetchSignedUrls();
  }, [entry]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const handleDelete = () => {
    if (confirm('Delete this entry? This cannot be undone.')) {
      onDelete(entry.id);
      onClose();
    }
  };

  const handleEdit = () => {
    onClose();
    onEdit(entry);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-2xl relative z-10 flex flex-col max-h-[90vh] shadow-2xl border-brand-border/60 animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Coloured top accent bar */}
        <div className={`h-1 w-full ${cfg.bar} opacity-70`} />

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-brand-border/40">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${cfg.bg} border ${cfg.border}`}>
              {cfg.icon(18)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>
                  {cfg.label}
                </span>
                {entry.collection_name && (
                  <div className="flex items-center gap-1 bg-brand-border/30 px-1.5 py-0.5 rounded-md text-[9px] font-bold text-brand-textMuted uppercase tracking-wider">
                    <Folder size={10} className="text-brand-textMuted/80" />
                    <span>{entry.collection_name}</span>
                  </div>
                )}
              </div>
              {entry.is_favorite && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={10} className="text-amber-400 fill-amber-400" />
                  <span className="text-[10px] text-amber-400 font-semibold">Favorited</span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onToggleFavorite(entry.id)}
              className={`p-2 rounded-xl border transition-all ${
                entry.is_favorite
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'border-brand-border/40 text-brand-textMuted hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20'
              }`}
              title={entry.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star size={14} className={entry.is_favorite ? 'fill-amber-400/40' : ''} />
            </button>
            <button
              onClick={handleEdit}
              className="p-2 rounded-xl border border-brand-border/40 text-brand-textMuted hover:text-brand-textMain hover:bg-brand-card transition-all"
              title="Edit entry"
            >
              <Edit size={14} />
            </button>
            <button
              onClick={handleDelete}
              className="p-2 rounded-xl border border-brand-border/40 text-brand-textMuted hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
              title="Delete entry"
            >
              <Trash2 size={14} />
            </button>
            <div className="w-px h-5 bg-brand-border/40 mx-0.5" />
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-brand-border/40 text-brand-textMuted hover:text-brand-textMain hover:bg-brand-card transition-all"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Title */}
          <h2 className="text-2xl font-bold text-brand-textMain leading-snug tracking-tight">
            {entry.title}
          </h2>

          {/* URL — bookmarks & resources */}
          {entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-brand-dark/60 border border-brand-border/30 text-sm text-brand-accentLight hover:border-brand-accent/50 hover:bg-brand-dark/80 transition-all w-fit max-w-full group"
            >
              <ExternalLink size={14} className="shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate font-medium">{entry.url}</span>
            </a>
          )}

          {/* AI Summary */}
          {entry.summary && (
            <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/15 text-sm leading-relaxed text-brand-textMuted flex gap-2.5 items-start">
              <Sparkles size={16} className="text-brand-accentLight shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accentLight block">AI Generated Summary</span>
                <p className="italic font-medium">{entry.summary}</p>
              </div>
            </div>
          )}

          {/* Content */}
          {entry.content && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">
                  {entry.type === 'snippet' ? 'Code' : 'Content'}
                </span>
                <div className="h-px flex-1 bg-brand-border/30" />
              </div>

              {entry.type === 'snippet' ? (
                <div className="relative group">
                  <pre className="p-5 bg-[#0a0f1e] rounded-xl text-sm font-mono text-green-300 border border-brand-border/40 overflow-x-auto whitespace-pre leading-relaxed">
                    <code>{entry.content}</code>
                  </pre>
                  {/* Language label hint */}
                  <span className="absolute top-3 right-3 text-[10px] font-bold text-brand-textMuted/40 uppercase tracking-wider">
                    code
                  </span>
                </div>
              ) : (
                <p className="text-brand-textMuted leading-relaxed whitespace-pre-wrap text-sm font-medium">
                  {entry.content}
                </p>
              )}
            </div>
          )}

          {/* Attachments */}
          {entry.attachments && entry.attachments.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Paperclip size={11} className="text-brand-textMuted" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">
                  Attachments
                </span>
                <div className="h-px flex-1 bg-brand-border/30" />
              </div>

              {/* Images Grid / Gallery */}
              {entry.attachments.some(att => att.mime_type.startsWith('image/')) && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-brand-textMuted/75 uppercase tracking-wider">Images</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {entry.attachments
                      .filter(att => att.mime_type.startsWith('image/'))
                      .map(att => (
                        <div 
                          key={att.id}
                          onClick={() => signedUrls[att.id] && setLightboxImage(signedUrls[att.id])}
                          className="relative aspect-video rounded-xl border border-brand-border/40 overflow-hidden cursor-zoom-in bg-brand-card/45 hover:border-brand-accent/50 group transition-all"
                        >
                          {signedUrls[att.id] ? (
                            <img 
                              src={signedUrls[att.id]} 
                              alt={att.file_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Loader2 size={16} className="animate-spin text-brand-textMuted" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye size={18} className="text-white" />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Inline PDF Viewer */}
              {entry.attachments.some(att => att.mime_type === 'application/pdf' || att.file_name.endsWith('.pdf')) && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-brand-textMuted/75 uppercase tracking-wider">Document Preview</span>
                  {activePdfUrl ? (
                    <div className="relative rounded-xl border border-brand-border/40 overflow-hidden bg-brand-card/25 shadow-inner">
                      <iframe 
                        src={`${activePdfUrl}#toolbar=0`}
                        className="w-full h-[400px] border-none bg-brand-dark/50" 
                        title="PDF document preview"
                      />
                    </div>
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-xl border border-brand-border/40 bg-brand-dark/20 text-brand-textMuted">
                      <Loader2 size={24} className="animate-spin" />
                    </div>
                  )}
                </div>
              )}

              {/* Download / List of Files */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-brand-textMuted/75 uppercase tracking-wider">Files List</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {entry.attachments.map((att) => {
                    const hasPdf = att.mime_type === 'application/pdf' || att.file_name.endsWith('.pdf');
                    return (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-brand-dark/40 border border-brand-border/40 text-xs font-semibold hover:border-brand-accent/40 hover:bg-brand-dark/60 transition-all select-none group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText size={14} className="text-brand-textMuted" />
                          <div className="min-w-0">
                            <span className="text-brand-textMain block truncate">{att.file_name}</span>
                            <span className="text-[9px] text-brand-textMuted/65 block font-medium">
                              {(att.file_size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {hasPdf && signedUrls[att.id] && (
                            <button
                              type="button"
                              onClick={() => setActivePdfUrl(signedUrls[att.id])}
                              className={`p-1.5 rounded-lg border text-brand-textMuted transition-colors ${
                                activePdfUrl === signedUrls[att.id]
                                  ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accentLight'
                                  : 'border-transparent hover:bg-brand-border/40 hover:text-brand-textMain'
                              }`}
                              title="Preview PDF"
                            >
                              <Eye size={12} />
                            </button>
                          )}
                          {signedUrls[att.id] ? (
                            <a
                              href={signedUrls[att.id]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg hover:bg-brand-border/40 text-brand-textMuted hover:text-brand-accentLight transition-colors"
                              title="Download file"
                            >
                              <Download size={12} />
                            </a>
                          ) : (
                            <div className="p-1.5 text-brand-textMuted/30">
                              <Loader2 size={12} className="animate-spin" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {((entry.tags && entry.tags.length > 0) || (entry.ai_tags && entry.ai_tags.length > 0)) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag size={11} className="text-brand-textMuted" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">
                  Tags
                </span>
                <div className="h-px flex-1 bg-brand-border/30" />
              </div>
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <TagBadge
                    key={tag.id}
                    tag={tag}
                    onClick={
                      onTagClick
                        ? () => {
                            onTagClick(tag.name);
                            onClose();
                          }
                        : undefined
                    }
                  />
                ))}
                {entry.ai_tags?.map((aiTag, idx) => (
                  <span
                    key={`ai-tag-detail-${idx}`}
                    onClick={
                      onTagClick
                        ? () => {
                            onTagClick(aiTag);
                            onClose();
                          }
                        : undefined
                    }
                    className="inline-flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 hover:border-purple-500/40 px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-400 cursor-pointer select-none transition-all"
                    title="AI Suggested Tag"
                  >
                    <Sparkles size={10} className="text-purple-400" />
                    <span>{aiTag}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer — timestamps */}
        <div className="px-6 py-4 border-t border-brand-border/40 bg-brand-card/20 flex flex-wrap items-center gap-x-6 gap-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-brand-textMuted/55 font-semibold">
            <Calendar size={11} />
            <span>
              Created {formatDate(entry.created_at)} · {formatTime(entry.created_at)}
            </span>
          </div>
          {entry.updated_at !== entry.created_at && (
            <div className="flex items-center gap-1.5 text-[11px] text-brand-textMuted/55 font-semibold">
              <Clock size={11} />
              <span>Updated {formatDate(entry.updated_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <button 
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={() => setLightboxImage(null)}
          >
            <X size={24} />
          </button>
          <img 
            src={lightboxImage} 
            alt="Enlarged view" 
            className="max-w-[95%] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
          />
        </div>
      )}
    </div>
  );
}
