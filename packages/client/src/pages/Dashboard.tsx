import { useState, useEffect, useCallback } from 'react';
import { Entry, Tag, EntryType, Collection } from '../lib/types';
import { api } from '../lib/api';
import Sidebar from '../components/Sidebar';
import TypeFilter from '../components/TypeFilter';
import SearchBar from '../components/SearchBar';
import EntryCard from '../components/EntryCard';
import EntryForm from '../components/EntryForm';
import EntryDetail from '../components/EntryDetail';
import { Plus, X, Sparkles, Filter, ArrowUpDown, Menu } from 'lucide-react';

type SortOrder = 'newest' | 'oldest' | 'az' | 'za';

interface DashboardProps {
  user: { email: string };
  onLogout: () => void;
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'az',     label: 'A → Z'  },
  { value: 'za',     label: 'Z → A'  },
];

function sortEntries(entries: Entry[], order: SortOrder): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    switch (order) {
      case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'az':     return a.title.localeCompare(b.title);
      case 'za':     return b.title.localeCompare(a.title);
    }
  });
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [selectedType, setSelectedType] = useState<EntryType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'favorites'>('all');

  // Sort
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  // Detail view state
  const [detailEntry, setDetailEntry] = useState<Entry | null>(null);

  // Mobile sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Fetch / filter data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const fetchedTags = await api.getTags();
      setTags(fetchedTags);

      const fetchedCols = await api.getCollections();
      setCollections(fetchedCols);

      const resolvedTag = fetchedTags.find((t) => t.name === activeTag);
      const fetchedEntries = await api.searchEntries(
        searchQuery,
        selectedType === 'all' ? undefined : selectedType,
        resolvedTag?.id,
        activeCollectionId || undefined
      );

      const filtered = activeFilter === 'favorites'
        ? fetchedEntries.filter((e) => e.is_favorite)
        : fetchedEntries;

      setEntries(sortEntries(filtered, sortOrder));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedType, activeTag, activeFilter, sortOrder, activeCollectionId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Unfiltered counts for sidebar & TypeFilter
  const [allRawEntries, setAllRawEntries] = useState<Entry[]>([]);
  const loadCounts = useCallback(async () => {
    try { setAllRawEntries(await api.searchEntries('')); } catch {}
  }, []);
  useEffect(() => { loadCounts(); }, [entries, loadCounts]);

  const counts: Record<EntryType | 'all', number> = {
    all:      allRawEntries.length,
    note:     allRawEntries.filter((e) => e.type === 'note').length,
    bookmark: allRawEntries.filter((e) => e.type === 'bookmark').length,
    snippet:  allRawEntries.filter((e) => e.type === 'snippet').length,
    idea:     allRawEntries.filter((e) => e.type === 'idea').length,
    resource: allRawEntries.filter((e) => e.type === 'resource').length,
  };

  // Tag management
  const handleCreateTag = async (name: string): Promise<Tag> => {
    const created = await api.createTag(name);
    setTags(await api.getTags());
    return created;
  };

  const handleDeleteTag = async (id: string) => {
    await api.deleteTag(id);
    if (activeTag) {
      const remaining = await api.getTags();
      if (!remaining.some((t) => t.name === activeTag)) setActiveTag(null);
    }
    loadData();
  };

  // Collection management
  const handleCreateCollection = async (name: string) => {
    try {
      await api.createCollection(name);
      const fetchedCols = await api.getCollections();
      setCollections(fetchedCols);
    } catch (err) {
      console.error('Failed to create collection:', err);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    try {
      await api.deleteCollection(id);
      if (activeCollectionId === id) {
        setActiveCollectionId(null);
      }
      const fetchedCols = await api.getCollections();
      setCollections(fetchedCols);
      loadData();
    } catch (err) {
      console.error('Failed to delete collection:', err);
    }
  };

  // Entry CRUD
  const handleSaveEntry = async (input: { 
    title: string; 
    content: string; 
    type: EntryType; 
    url: string; 
    tag_ids: string[];
    collection_id?: string | null;
    is_pinned?: boolean;
  }) => {
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
    // Update the detailEntry in place if it's open
    setDetailEntry((prev) => prev?.id === id ? { ...prev, is_favorite: !prev.is_favorite } : prev);
    loadData();
  };

  const handleTogglePin = async (id: string) => {
    try {
      await api.togglePin(id);
      // Update the detailEntry in place if it's open
      setDetailEntry((prev) => prev?.id === id ? { ...prev, is_pinned: !prev.is_pinned } : prev);
      loadData();
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  const handleEditClick = (entry: Entry) => {
    setEditingEntry(entry);
    setIsFormOpen(true);
  };

  const clearAllFilters = () => {
    setSelectedType('all');
    setSearchQuery('');
    setActiveTag(null);
    setActiveCollectionId(null);
    setActiveFilter('all');
  };

  const handleSelectTag = (tagName: string | null) => {
    setActiveTag(tagName);
    setActiveCollectionId(null);
  };

  const handleSelectCollection = (collectionId: string | null) => {
    setActiveCollectionId(collectionId);
    setActiveTag(null);
  };

  const activeSortLabel = SORT_OPTIONS.find((o) => o.value === sortOrder)?.label ?? 'Sort';

  return (
    <div className="flex h-screen overflow-hidden bg-brand-dark">

      {/* ── Mobile sidebar overlay backdrop ── */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 w-72 md:static md:w-64 md:flex md:flex-col
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <Sidebar
          user={user}
          onLogout={onLogout}
          tags={tags}
          collections={collections}
          entries={allRawEntries}
          activeTag={activeTag}
          activeCollectionId={activeCollectionId}
          onSelectTag={(t) => { handleSelectTag(t); setIsSidebarOpen(false); }}
          onSelectCollection={(c) => { handleSelectCollection(c); setIsSidebarOpen(false); }}
          onCreateTag={handleCreateTag}
          onCreateCollection={handleCreateCollection}
          onDeleteTag={handleDeleteTag}
          onDeleteCollection={handleDeleteCollection}
          activeFilter={activeFilter}
          onSelectFilter={(f) => { setActiveFilter(f); setIsSidebarOpen(false); }}
        />
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

        {/* Top header */}
        <header className="p-4 md:p-6 border-b border-brand-border/40 flex items-center justify-between gap-3 bg-brand-dark/20 shrink-0">
          {/* Hamburger (mobile only) */}
          <button
            className="md:hidden p-2 rounded-xl border border-brand-border/40 text-brand-textMuted hover:text-brand-textMain hover:bg-brand-card transition-all shrink-0"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          <div className="flex-1 max-w-lg">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>

          {/* Sort control */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 bg-brand-card border border-brand-border/50 hover:border-brand-border text-sm font-semibold rounded-xl text-brand-textMuted hover:text-brand-textMain transition-all shrink-0 select-none"
            >
              <ArrowUpDown size={14} />
              <span className="hidden md:inline">{activeSortLabel}</span>
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-20 glass-card border border-brand-border/60 rounded-xl shadow-xl overflow-hidden w-36 py-1">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortOrder(opt.value); setShowSortMenu(false); }}
                      className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                        sortOrder === opt.value
                          ? 'text-brand-accentLight bg-brand-accent/10'
                          : 'text-brand-textMuted hover:text-brand-textMain hover:bg-brand-card/60'
                      }`}
                    >
                      {opt.value === sortOrder && <span className="mr-1.5 text-brand-accentLight">✓</span>}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={() => { setEditingEntry(null); setIsFormOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold rounded-xl text-white shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.99] transition-all shrink-0 select-none"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Save Knowledge</span>
            <span className="sm:hidden">Save</span>
          </button>
        </header>

        {/* Dynamic Entry Dashboard Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

          {/* Section title & Category filters */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-brand-textMain">
                {activeFilter === 'favorites' ? 'Favorite Saves' : activeTag ? `Tagged: #${activeTag}` : activeCollectionId ? `Collection: ${collections.find((c) => c.id === activeCollectionId)?.name || ''}` : 'My Knowledge Base'}
              </h2>
              {(selectedType !== 'all' || searchQuery || activeTag || activeFilter !== 'all' || activeCollectionId) && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 text-xs font-bold text-brand-accentLight hover:underline"
                >
                  <X size={12} />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            <TypeFilter selectedType={selectedType} onSelectType={setSelectedType} counts={counts} />
          </div>

          {/* Active filter chips */}
          {(activeTag || selectedType !== 'all' || activeFilter === 'favorites' || activeCollectionId) && (
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
              {activeCollectionId && (
                <span className="bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-md font-semibold border border-indigo-500/20">
                  Collection: {collections.find((c) => c.id === activeCollectionId)?.name || 'Folder'}
                </span>
              )}
            </div>
          )}

          {/* Loading / Empty / Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mb-3" />
              <p className="text-xs font-medium">Querying knowledge base...</p>
            </div>
          ) : entries.length === 0 ? (
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
                  onClick={() => { setEditingEntry(null); setIsFormOpen(true); }}
                  className="px-4 py-2 bg-brand-accent hover:bg-brand-accentLight text-xs text-white font-bold rounded-xl shadow-md transition-all select-none"
                >
                  Create First Entry
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
              {entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onViewDetail={setDetailEntry}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteEntry}
                  onToggleFavorite={handleToggleFavorite}
                  onTogglePin={handleTogglePin}
                  onTagClick={handleSelectTag}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Entry Detail Modal */}
      {detailEntry && (
        <EntryDetail
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
          onEdit={handleEditClick}
          onDelete={handleDeleteEntry}
          onToggleFavorite={handleToggleFavorite}
          onTagClick={handleSelectTag}
        />
      )}

      {/* Entry Form Modal */}
      {isFormOpen && (
        <EntryForm
          entry={editingEntry}
          tags={tags}
          collections={collections}
          onSave={handleSaveEntry}
          onClose={() => { setIsFormOpen(false); setEditingEntry(null); }}
          onCreateTag={handleCreateTag}
        />
      )}
    </div>
  );
}
