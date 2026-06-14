import { Entry } from '../lib/types';
import {
  FileText, Bookmark, Code, Lightbulb, Globe,
  Star, Edit, Trash2, X, ExternalLink, Calendar, Clock, Tag, Folder
} from 'lucide-react';
import TagBadge from './TagBadge';

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

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
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
    </div>
  );
}
