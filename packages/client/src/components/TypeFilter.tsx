import React from 'react';
import { EntryType } from '../lib/types';
import { FileText, Bookmark, Code, Lightbulb, Globe, Grid } from 'lucide-react';

interface TypeFilterProps {
  selectedType: EntryType | 'all';
  onSelectType: (type: EntryType | 'all') => void;
  counts: Record<EntryType | 'all', number>;
}

export default function TypeFilter({ selectedType, onSelectType, counts }: TypeFilterProps) {
  const items: { label: string; value: EntryType | 'all'; icon: React.ReactNode; color: string; activeColor: string }[] = [
    { label: 'All', value: 'all', icon: <Grid size={14} />, color: 'hover:text-brand-textMain', activeColor: 'bg-brand-border/60 text-brand-textMain border-brand-border' },
    { label: 'Notes', value: 'note', icon: <FileText size={14} />, color: 'hover:text-entry-note', activeColor: 'bg-blue-500/10 text-entry-note border-blue-500/30' },
    { label: 'Bookmarks', value: 'bookmark', icon: <Bookmark size={14} />, color: 'hover:text-entry-bookmark', activeColor: 'bg-emerald-500/10 text-entry-bookmark border-emerald-500/30' },
    { label: 'Snippets', value: 'snippet', icon: <Code size={14} />, color: 'hover:text-entry-snippet', activeColor: 'bg-amber-500/10 text-entry-snippet border-amber-500/30' },
    { label: 'Ideas', value: 'idea', icon: <Lightbulb size={14} />, color: 'hover:text-entry-idea', activeColor: 'bg-violet-500/10 text-entry-idea border-violet-500/30' },
    { label: 'Resources', value: 'resource', icon: <Globe size={14} />, color: 'hover:text-entry-resource', activeColor: 'bg-pink-500/10 text-entry-resource border-pink-500/30' },
  ];

  return (
    <div className="flex flex-wrap gap-2 py-1">
      {items.map((item) => {
        const isActive = selectedType === item.value;
        return (
          <button
            key={item.value}
            onClick={() => onSelectType(item.value)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-transparent transition-all select-none
              ${isActive 
                ? item.activeColor 
                : `bg-brand-card/40 text-brand-textMuted hover:bg-brand-card/75 ${item.color}`
              }
            `}
          >
            {item.icon}
            <span>{item.label}</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive ? 'bg-white/10' : 'bg-brand-border/40'}`}>
              {counts[item.value] || 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
