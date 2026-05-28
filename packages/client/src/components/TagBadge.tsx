import { Tag } from '../lib/types';
import { Hash, X } from 'lucide-react';

interface TagBadgeProps {
  tag: Tag;
  onClick?: () => void;
  onRemove?: () => void;
  active?: boolean;
}

export default function TagBadge({ tag, onClick, onRemove, active }: TagBadgeProps) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold select-none transition-all cursor-pointer
        ${active 
          ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-sm shadow-indigo-500/10' 
          : 'bg-brand-border/40 text-brand-textMuted border border-brand-border/20 hover:border-brand-border hover:bg-brand-border/60 hover:text-brand-textMain'
        }
      `}
    >
      <Hash size={11} className="opacity-70" />
      <span>{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 p-0.5 rounded-full hover:bg-brand-dark/55 text-brand-textMuted hover:text-brand-textMain transition-colors"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}
