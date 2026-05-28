
import { Entry } from '../lib/types';
import { FileText, Bookmark, Code, Lightbulb, Globe, Star, Edit, Trash2, ExternalLink } from 'lucide-react';
import TagBadge from './TagBadge';

interface EntryCardProps {
  entry: Entry;
  onEdit: (entry: Entry) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onTagClick?: (tagName: string) => void;
}

export default function EntryCard({
  entry,
  onEdit,
  onDelete,
  onToggleFavorite,
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
    <div className={`glass-card p-5 flex flex-col justify-between entry-card-transition ${borderColor} relative overflow-hidden group`}>
      {/* Top Header Row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[10px] font-bold tracking-wider uppercase text-brand-textMuted/70">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Favorite button */}
          <button
            onClick={() => onToggleFavorite(entry.id)}
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
            onClick={() => onEdit(entry)}
            className="p-1.5 rounded-lg hover:bg-brand-border/40 text-brand-textMuted hover:text-brand-textMain transition-colors"
            title="Edit entry"
          >
            <Edit size={13} />
          </button>
          {/* Delete button */}
          <button
            onClick={() => {
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
      <h3 className="text-base font-bold text-brand-textMain leading-snug tracking-tight mb-2 pr-4 group-hover:text-brand-accentLight transition-colors">
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
              <TagBadge
                key={tag.id}
                tag={tag}
                onClick={onTagClick ? () => onTagClick(tag.name) : undefined}
              />
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
