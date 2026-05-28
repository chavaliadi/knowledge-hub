import { useState, useEffect, useCallback } from 'react';
import { Entry, Tag, EntryType } from '../lib/types';
import { api } from '../lib/api';
import Sidebar from '../components/Sidebar';
import TypeFilter from '../components/TypeFilter';
import SearchBar from '../components/SearchBar';
import EntryCard from '../components/EntryCard';
import EntryForm from '../components/EntryForm';
import { Plus, X, Sparkles, Filter } from 'lucide-react';

interface DashboardProps {
  user: { email: string };
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [selectedType, setSelectedType] = useState<EntryType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'favorites'>('all');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  // Fetch initial data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const fetchedTags = await api.getTags();
      setTags(fetchedTags);
      
      // Perform search/filter queries via API wrapper
      const resolvedTag = fetchedTags.find((t) => t.name === activeTag);
      const fetchedEntries = await api.searchEntries(
        searchQuery,
        selectedType === 'all' ? undefined : selectedType,
        resolvedTag?.id
      );
      
      // Secondary client-side filter for favorites
      const filtered = activeFilter === 'favorites' 
        ? fetchedEntries.filter(e => e.is_favorite)
        : fetchedEntries;

      setEntries(filtered);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedType, activeTag, activeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute dynamic counts based on *all* entries in local storage (unfiltered)
  const [allRawEntries, setAllRawEntries] = useState<Entry[]>([]);
  
  const loadCounts = useCallback(async () => {
    try {
      const all = await api.searchEntries('');
      setAllRawEntries(all);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [entries, loadCounts]);

  const counts: Record<EntryType | 'all', number> = {
    all: allRawEntries.length,
    note: allRawEntries.filter((e) => e.type === 'note').length,
    bookmark: allRawEntries.filter((e) => e.type === 'bookmark').length,
    snippet: allRawEntries.filter((e) => e.type === 'snippet').length,
    idea: allRawEntries.filter((e) => e.type === 'idea').length,
    resource: allRawEntries.filter((e) => e.type === 'resource').length
  };

  // Tags API management
  const handleCreateTag = async (name: string): Promise<Tag> => {
    const created = await api.createTag(name);
    const updatedTags = await api.getTags();
    setTags(updatedTags);
    return created;
  };

  const handleDeleteTag = async (id: string) => {
    await api.deleteTag(id);
    if (activeTag) {
      const remainingTags = await api.getTags();
      const stillExists = remainingTags.some(t => t.name === activeTag);
      if (!stillExists) setActiveTag(null);
    }
    loadData();
  };

  // Entries CRUD
  const handleSaveEntry = async (input: { title: string; content: string; type: EntryType; url: string; tag_ids: string[] }) => {
    try {
      if (editingEntry) {
        await api.updateEntry(editingEntry.id, input);
      } else {
        await api.createEntry(input);
      }
      setIsFormOpen(false);
      setEditingEntry(null);
      loadData();
    } catch (err) {
      console.error('Failed to save entry:', err);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    await api.deleteEntry(id);
    loadData();
  };

  const handleToggleFavorite = async (id: string) => {
    await api.toggleFavorite(id);
    loadData();
  };

  const handleEditClick = (entry: Entry) => {
    setEditingEntry(entry);
    setIsFormOpen(true);
  };

  const clearAllFilters = () => {
    setSelectedType('all');
    setSearchQuery('');
    setActiveTag(null);
    setActiveFilter('all');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-brand-dark">
      {/* Left Sidebar */}
      <Sidebar
        user={user}
        onLogout={onLogout}
        tags={tags}
        entries={allRawEntries}
        activeTag={activeTag}
        onSelectTag={setActiveTag}
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header Navigation */}
        <header className="p-6 border-b border-brand-border/40 flex items-center justify-between gap-4 bg-brand-dark/20 shrink-0">
          <div className="flex-1 max-w-lg">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>
          <button
            onClick={() => {
              setEditingEntry(null);
              setIsFormOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold rounded-xl text-white shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.99] transition-all shrink-0 select-none"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Save Knowledge</span>
            <span className="sm:hidden">Save</span>
          </button>
        </header>

        {/* Dynamic Entry Dashboard Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section title & Category Type selectors */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-brand-textMain">
                {activeFilter === 'favorites' ? 'Favorite Saves' : activeTag ? `Tagged: #${activeTag}` : 'My Knowledge Base'}
              </h2>
              {/* Reset filter helpers */}
              {(selectedType !== 'all' || searchQuery || activeTag || activeFilter !== 'all') && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 text-xs font-bold text-brand-accentLight hover:underline"
                >
                  <X size={12} />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            <TypeFilter
              selectedType={selectedType}
              onSelectType={setSelectedType}
              counts={counts}
            />
          </div>

          {/* Active Filtering indicators */}
          {(activeTag || selectedType !== 'all' || activeFilter === 'favorites') && (
            <div className="flex flex-wrap items-center gap-1.5 bg-brand-card/20 p-2.5 rounded-xl border border-brand-border/20 text-xs">
              <span className="text-brand-textMuted font-bold mr-1 flex items-center gap-1">
                <Filter size={11} />
                <span>Active Filters:</span>
              </span>
              {activeFilter === 'favorites' && (
                <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md font-semibold border border-amber-500/20">
                  Favorites
                </span>
              )}
              {selectedType !== 'all' && (
                <span className="bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-md font-semibold border border-indigo-500/20 capitalize">
                  Type: {selectedType}
                </span>
              )}
              {activeTag && (
                <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md font-semibold border border-emerald-500/20">
                  Tag: #{activeTag}
                </span>
              )}
            </div>
          )}

          {/* Load indicator */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mb-3"></div>
              <p className="text-xs font-medium">Querying Knowledge base...</p>
            </div>
          ) : entries.length === 0 ? (
            /* Empty Dashboard Layout */
            <div className="flex flex-col items-center justify-center text-center py-16 px-4 bg-brand-card/10 border border-brand-border/30 rounded-2xl max-w-xl mx-auto shadow-inner animate-in fade-in duration-300">
              <div className="p-4 bg-brand-card rounded-2xl border border-brand-border shadow-md text-brand-textMuted mb-4">
                <Sparkles size={28} className="glow-text text-brand-accentLight" />
              </div>
              <h3 className="text-base font-bold text-brand-textMain mb-1.5">No matching saves found</h3>
              <p className="text-sm text-brand-textMuted max-w-xs leading-relaxed font-medium mb-5">
                {searchQuery 
                  ? `No entries match "${searchQuery}". Try revising your search phrase.` 
                  : 'Your personal knowledge vault is empty. Click "Save Knowledge" to add notes, bookmarks, snippets, or resources!'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => {
                    setEditingEntry(null);
                    setIsFormOpen(true);
                  }}
                  className="px-4 py-2 bg-brand-accent hover:bg-brand-accentLight text-xs text-white font-bold rounded-xl shadow-md transition-all select-none"
                >
                  Create First Entry
                </button>
              )}
            </div>
          ) : (
            /* Card Grid List */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteEntry}
                  onToggleFavorite={handleToggleFavorite}
                  onTagClick={setActiveTag}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Entry Modal Forms */}
      {isFormOpen && (
        <EntryForm
          entry={editingEntry}
          tags={tags}
          onSave={handleSaveEntry}
          onClose={() => {
            setIsFormOpen(false);
            setEditingEntry(null);
          }}
          onCreateTag={handleCreateTag}
        />
      )}
    </div>
  );
}
