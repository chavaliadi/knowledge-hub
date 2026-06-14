import { Entry } from '../lib/types';
import { FileText, Bookmark, Code, Lightbulb, Globe, Star, Edit, Trash2, ExternalLink, Pin, Folder } from 'lucide-react';
import TagBadge from './TagBadge';

interface EntryCardProps {
  entry: Entry;
  onViewDetail: (entry: Entry) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onTagClick?: (tagName: string) => void;
}

export default function EntryCard({
  entry,
  onViewDetail,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTogglePin,
  onTagClick
}: EntryCardProps) {
  
  // Icon and border configuration based on type
  const typeConfig = {
    note: {
      icon: <FileText size={16} className="text-entry-note" />,
      borderColor: 'border-l-4 border-l-entry-note',
      bgTag: 'bg-entry-note/5 text-entry-note',
      label: 'Note'
    },
    bookmark: {
      icon: <Bookmark size={16} className="text-entry-bookmark" />,
      borderColor: 'border-l-4 border-l-entry-bookmark',
      bgTag: 'bg-entry-bookmark/5 text-entry-bookmark',
      label: 'Bookmark'
    },
    snippet: {
      icon: <Code size={16} className="text-entry-snippet" />,
      borderColor: 'border-l-4 border-l-entry-snippet',
      bgTag: 'bg-entry-snippet/5 text-entry-snippet',
      label: 'Snippet'
    },
    idea: {
      icon: <Lightbulb size={16} className="text-entry-idea" />,
      borderColor: 'border-l-4 border-l-entry-idea',
      bgTag: 'bg-entry-idea/5 text-entry-idea',
      label: 'Project Idea'
    },
    resource: {
      icon: <Globe size={16} className="text-entry-resource" />,
      borderColor: 'border-l-4 border-l-entry-resource',
      bgTag: 'bg-entry-resource/5 text-entry-resource',
      label: 'Resource'
    }
  };

  const { icon, borderColor, label } = typeConfig[entry.type];

  // Helper to format date nicely
  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div
      className={`glass-card p-5 flex flex-col justify-between entry-card-transition ${borderColor} relative overflow-hidden group cursor-pointer
        ${entry.is_pinned ? 'border-r border-t border-brand-accent/30 shadow-md shadow-brand-accent/5' : ''}
      `}
      onClick={() => onViewDetail(entry)}
    >
      {/* Top Header Row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-[10px] font-bold tracking-wider uppercase text-brand-textMuted/70">{label}</span>
          </div>
          
          {/* Collection tag if set */}
          {entry.collection_name && (
            <div className="flex items-center gap-1 bg-brand-border/30 px-1.5 py-0.5 rounded-md text-[9px] font-bold text-brand-textMuted uppercase tracking-wider">
              <Folder size={10} className="text-brand-textMuted/80" />
              <span className="truncate max-w-[80px]">{entry.collection_name}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {/* Pin button */}
          {onTogglePin && (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(entry.id); }}
              className="p-1.5 rounded-lg hover:bg-brand-border/40 text-brand-textMuted hover:text-indigo-400 transition-colors"
              title={entry.is_pinned ? 'Unpin from top' : 'Pin to top'}
            >
              <Pin
                size={14}
                className={entry.is_pinned ? 'text-indigo-400 fill-indigo-400/20 rotate-45' : 'opacity-40 group-hover:opacity-100'}
              />
            </button>
          )}
          
          {/* Favorite button */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(entry.id); }}
            className="p-1.5 rounded-lg hover:bg-brand-border/40 text-brand-textMuted hover:text-amber-400 transition-colors"
            title={entry.is_favorite ? 'Remove from favorites' : 'Mark as favorite'}
          >
            <Star
              size={14}
              className={entry.is_favorite ? 'text-amber-400 fill-amber-400/20' : ''}
            />
          </button>
          {/* Edit button */}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
            className="p-1.5 rounded-lg hover:bg-brand-border/40 text-brand-textMuted hover:text-brand-textMain transition-colors"
            title="Edit entry"
          >
            <Edit size={13} />
          </button>
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Are you sure you want to delete this entry?')) {
                onDelete(entry.id);
              }
            }}
            className="p-1.5 rounded-lg hover:bg-brand-border/40 text-brand-textMuted hover:text-red-400 transition-colors"
            title="Delete entry"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-base font-bold text-brand-textMain leading-snug tracking-tight mb-2 pr-4 group-hover:text-brand-accentLight transition-colors flex items-center gap-1.5">
        {entry.title}
      </h3>

      {/* Content Rendering based on type */}
      <div className="flex-1 text-sm text-brand-textMuted mb-4 leading-relaxed font-medium">
        {entry.type === 'snippet' && entry.content ? (
          <pre className="p-3 bg-brand-dark/60 rounded-lg text-xs font-mono text-brand-textMain border border-brand-border/40 overflow-x-auto whitespace-pre">
            <code>{entry.content}</code>
          </pre>
        ) : entry.type === 'bookmark' && entry.url ? (
          <div className="flex flex-col gap-2">
            <p className="line-clamp-2">{entry.content}</p>
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand-accentLight hover:underline font-semibold w-fit mt-1"
            >
              <span>{entry.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
              <ExternalLink size={12} />
            </a>
          </div>
        ) : (
          <p className="line-clamp-4 whitespace-pre-wrap">{entry.content}</p>
        )}
      </div>

      {/* Footer Info (Tags & Date) */}
      <div className="flex flex-col gap-3 pt-3 border-t border-brand-border/20">
        {/* Tags */}
        {entry.tags && entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <span key={tag.id} onClick={(e) => e.stopPropagation()}>
                <TagBadge
                  tag={tag}
                  onClick={onTagClick ? () => onTagClick(tag.name) : undefined}
                />
              </span>
            ))}
          </div>
        )}
        {/* Date info */}
        <div className="text-[10px] text-brand-textMuted/60 font-semibold flex items-center justify-between">
          <span>Created {formatDate(entry.created_at)}</span>
          {entry.updated_at !== entry.created_at && (
            <span>Updated {formatDate(entry.updated_at)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
