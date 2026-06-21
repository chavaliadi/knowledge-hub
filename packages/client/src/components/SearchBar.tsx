import { useState, useEffect } from 'react';
import { Search, X, Sparkles } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  aiSearch: boolean;
  onAiToggle: (val: boolean) => void;
}

export default function SearchBar({
  value,
  onChange,
  placeholder = 'Search titles, notes, content...',
  aiSearch,
  onAiToggle
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);

  // Sync state if prop changes externally
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce the change event by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      onChange(localValue);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [localValue, onChange]);

  return (
    <div className="relative w-full">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-textMuted">
        <Search size={16} className={aiSearch ? 'text-purple-400' : ''} />
      </div>
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={aiSearch ? 'Ask concepts: e.g. "message queues caching"' : placeholder}
        className={`block w-full pl-10 pr-20 py-2.5 bg-brand-card/60 border rounded-xl text-sm text-brand-textMain placeholder-brand-textMuted/60 focus:outline-none transition-all font-medium
          ${aiSearch 
            ? 'border-purple-500/40 focus:border-purple-500/60 focus:bg-brand-card/90 shadow-md shadow-purple-500/5 focus:ring-1 focus:ring-purple-500/30' 
            : 'border-brand-border focus:border-brand-accent/50 focus:bg-brand-card/90'
          }
        `}
      />
      
      <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5">
        {localValue && (
          <button
            type="button"
            onClick={() => {
              setLocalValue('');
              onChange('');
            }}
            className="p-1 rounded-lg text-brand-textMuted hover:text-brand-textMain transition-colors"
          >
            <X size={15} />
          </button>
        )}
        
        <button
          type="button"
          onClick={() => onAiToggle(!aiSearch)}
          className={`p-1.5 rounded-lg border transition-all select-none
            ${aiSearch 
              ? 'bg-purple-600/20 border-purple-500/40 text-purple-400 shadow-sm shadow-purple-500/10 scale-105' 
              : 'bg-transparent border-transparent text-brand-textMuted hover:text-purple-400 hover:bg-purple-500/5'
            }
          `}
          title={aiSearch ? 'Disable AI Search' : 'Enable AI Search'}
        >
          <Sparkles size={14} className={aiSearch ? 'animate-pulse' : ''} />
        </button>
      </div>
    </div>
  );
}
