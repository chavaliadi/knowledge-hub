import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Search titles, notes, content...' }: SearchBarProps) {
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
        <Search size={16} />
      </div>
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="block w-full pl-10 pr-10 py-2.5 bg-brand-card/60 border border-brand-border rounded-xl text-sm text-brand-textMain placeholder-brand-textMuted/60 focus:outline-none focus:border-brand-accent/50 focus:bg-brand-card/90 transition-all font-medium"
      />
      {localValue && (
        <button
          onClick={() => {
            setLocalValue('');
            onChange('');
          }}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-brand-textMuted hover:text-brand-textMain transition-colors"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
