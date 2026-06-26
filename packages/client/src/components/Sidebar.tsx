import { useState } from 'react';
import { Tag, Entry, Collection } from '../lib/types';
import { BookOpen, LogOut, Plus, Trash2, Hash, Star, Folder, Brain } from 'lucide-react';

interface SidebarProps {
  user: { email: string };
  onLogout: () => void;
  tags: Tag[];
  collections: Collection[];
  entries: Entry[];
  activeTag: string | null;
  activeCollectionId: string | null;
  onSelectTag: (tagName: string | null) => void;
  onSelectCollection: (collectionId: string | null) => void;
  onCreateTag: (name: string) => void;
  onCreateCollection: (name: string) => void;
  onDeleteTag: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  activeFilter: 'all' | 'favorites' | 'intelligence';
  onSelectFilter: (filter: 'all' | 'favorites' | 'intelligence') => void;
}

export default function Sidebar({
  user,
  onLogout,
  tags,
  collections = [],
  entries,
  activeTag,
  activeCollectionId,
  onSelectTag,
  onSelectCollection,
  onCreateTag,
  onCreateCollection,
  onDeleteTag,
  onDeleteCollection,
  activeFilter,
  onSelectFilter
}: SidebarProps) {
  const [newTagName, setNewTagName] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isAddingCollection, setIsAddingCollection] = useState(false);

  // Compute tag counts based on stored entries
  const getTagCount = (tagId: string) => {
    return entries.filter((e) => e.tags.some((t) => t.id === tagId)).length;
  };

  // Compute collection counts
  const getCollectionCount = (collectionId: string) => {
    return entries.filter((e) => e.collection_id === collectionId).length;
  };

  const handleAddTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTagName.trim()) {
      onCreateTag(newTagName.trim());
      setNewTagName('');
      setIsAddingTag(false);
    }
  };

  const handleAddCollectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCollectionName.trim()) {
      onCreateCollection(newCollectionName.trim());
      setNewCollectionName('');
      setIsAddingCollection(false);
    }
  };

  const favoriteCount = entries.filter((e) => e.is_favorite).length;

  return (
    <aside className="w-64 border-r border-brand-border/40 bg-brand-dark/40 flex flex-col h-full overflow-hidden select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-brand-border/40 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-brand-accent/15 border border-brand-accent/20 text-brand-accentLight shadow-inner">
          <BookOpen size={20} className="glow-text" />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight tracking-tight text-brand-textMain">KnowledgeHub</h1>
          <span className="text-[10px] uppercase tracking-wider text-brand-textMuted/70 font-semibold">Personal KB</span>
        </div>
      </div>

      {/* Navigation & Stats */}
      <div className="p-4 flex flex-col gap-1 border-b border-brand-border/20">
        <button
          onClick={() => {
            onSelectFilter('all');
            onSelectTag(null);
            onSelectCollection(null);
          }}
          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm font-medium transition-all
            ${activeFilter === 'all' && !activeTag && !activeCollectionId
              ? 'bg-brand-card border border-brand-border/50 text-brand-textMain shadow-sm'
              : 'text-brand-textMuted hover:bg-brand-card/40 hover:text-brand-textMain'
            }
          `}
        >
          <div className="flex items-center gap-2.5">
            <BookOpen size={16} />
            <span>All Entries</span>
          </div>
          <span className="text-xs bg-brand-border/50 px-2 py-0.5 rounded-full text-brand-textMuted font-bold">
            {entries.length}
          </span>
        </button>

        <button
          onClick={() => {
            onSelectFilter('favorites');
            onSelectTag(null);
            onSelectCollection(null);
          }}
          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm font-medium transition-all
            ${activeFilter === 'favorites' && !activeTag && !activeCollectionId
              ? 'bg-brand-card border border-brand-border/50 text-brand-textMain shadow-sm'
              : 'text-brand-textMuted hover:bg-brand-card/40 hover:text-brand-textMain'
            }
          `}
        >
          <div className="flex items-center gap-2.5">
            <Star size={16} className={favoriteCount > 0 ? 'text-amber-400 fill-amber-400/20' : ''} />
            <span>Favorites</span>
          </div>
          <span className="text-xs bg-brand-border/50 px-2 py-0.5 rounded-full text-brand-textMuted font-bold">
            {favoriteCount}
          </span>
        </button>

        <button
          onClick={() => {
            onSelectFilter('intelligence');
            onSelectTag(null);
            onSelectCollection(null);
          }}
          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm font-medium transition-all
            ${activeFilter === 'intelligence' && !activeTag && !activeCollectionId
              ? 'bg-purple-600/10 border border-purple-500/30 text-purple-400 shadow-sm'
              : 'text-brand-textMuted hover:bg-brand-card/40 hover:text-brand-textMain hover:text-purple-400'
            }
          `}
        >
          <div className="flex items-center gap-2.5">
            <Brain size={16} className={activeFilter === 'intelligence' ? 'text-purple-400' : ''} />
            <span>AI Intelligence</span>
          </div>
        </button>
      </div>

      {/* Main sidebar scroll area */}
      <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-4 min-h-0">
        
        {/* Collections section */}
        <div className="px-4 flex flex-col">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted">Collections</span>
            <button
              onClick={() => setIsAddingCollection(!isAddingCollection)}
              className="p-1 rounded-md hover:bg-brand-card/70 text-brand-textMuted hover:text-brand-textMain transition-all"
              title="Create new collection"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Inline new collection form */}
          {isAddingCollection && (
            <form onSubmit={handleAddCollectionSubmit} className="mb-2 px-2 flex gap-1">
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Collection name..."
                autoFocus
                className="flex-1 bg-brand-card border border-brand-border px-2 py-1 rounded-lg text-xs text-brand-textMain placeholder-brand-textMuted/50 focus:outline-none focus:border-brand-accent/50"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-brand-accent hover:bg-brand-accentLight rounded-lg text-xs text-white font-medium"
              >
                Add
              </button>
            </form>
          )}

          {/* Collection List */}
          <div className="flex flex-col gap-0.5">
            {collections.length === 0 ? (
              <p className="text-xs text-brand-textMuted/50 italic px-2 py-1.5">No collections created yet.</p>
            ) : (
              collections.map((col) => {
                const count = getCollectionCount(col.id);
                const isActive = activeCollectionId === col.id;
                return (
                  <div
                    key={col.id}
                    className={`group flex items-center justify-between px-3 py-1.5 rounded-xl text-sm transition-all cursor-pointer select-none
                      ${isActive
                        ? 'bg-brand-card border border-brand-border/50 text-indigo-400 font-semibold'
                        : 'text-brand-textMuted hover:bg-brand-card/30 hover:text-brand-textMain'
                      }
                    `}
                    onClick={() => {
                      onSelectCollection(isActive ? null : col.id);
                      onSelectTag(null);
                      onSelectFilter('all');
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Folder size={14} className={`opacity-60 ${isActive ? 'text-indigo-400' : ''}`} />
                      <span className="truncate max-w-[120px]">{col.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold bg-brand-border/30 group-hover:bg-brand-border/50 px-1.5 py-0.2 rounded-full text-brand-textMuted transition-colors">
                        {count}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete collection "${col.name}"? Entries in this collection will be unlinked (not deleted).`)) {
                            onDeleteCollection(col.id);
                          }
                        }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-brand-border/50 text-brand-textMuted/60 hover:text-red-400 transition-all"
                        title="Delete collection"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tags section */}
        <div className="px-4 flex flex-col border-t border-brand-border/10 pt-4">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted">Tags</span>
            <button
              onClick={() => setIsAddingTag(!isAddingTag)}
              className="p-1 rounded-md hover:bg-brand-card/70 text-brand-textMuted hover:text-brand-textMain transition-all"
              title="Create new tag"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Inline new tag form */}
          {isAddingTag && (
            <form onSubmit={handleAddTagSubmit} className="mb-2 px-2 flex gap-1">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Tag name..."
                autoFocus
                className="flex-1 bg-brand-card border border-brand-border px-2 py-1 rounded-lg text-xs text-brand-textMain placeholder-brand-textMuted/50 focus:outline-none focus:border-brand-accent/50"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-brand-accent hover:bg-brand-accentLight rounded-lg text-xs text-white font-medium"
              >
                Add
              </button>
            </form>
          )}

          {/* Tag List */}
          <div className="flex flex-col gap-0.5">
            {tags.length === 0 ? (
              <p className="text-xs text-brand-textMuted/50 italic px-2 py-1.5">No tags created yet.</p>
            ) : (
              tags.map((tag) => {
                const count = getTagCount(tag.id);
                const isActive = activeTag === tag.name;
                return (
                  <div
                    key={tag.id}
                    className={`group flex items-center justify-between px-3 py-1.5 rounded-xl text-sm transition-all cursor-pointer select-none
                      ${isActive
                        ? 'bg-brand-card border border-brand-border/50 text-indigo-400 font-semibold'
                        : 'text-brand-textMuted hover:bg-brand-card/30 hover:text-brand-textMain'
                      }
                    `}
                    onClick={() => {
                      onSelectTag(isActive ? null : tag.name);
                      onSelectCollection(null);
                      onSelectFilter('all');
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Hash size={14} className="opacity-60" />
                      <span className="truncate max-w-[130px]">{tag.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold bg-brand-border/30 group-hover:bg-brand-border/50 px-1.5 py-0.2 rounded-full text-brand-textMuted transition-colors">
                        {count}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete tag #${tag.name}? This will remove it from all entries.`)) {
                            onDeleteTag(tag.id);
                          }
                        }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-brand-border/50 text-brand-textMuted/60 hover:text-red-400 transition-all"
                        title="Delete tag"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* User profile footer */}
      <div className="p-4 border-t border-brand-border/40 bg-brand-card/20 flex flex-col gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-brand-accent/20 border border-brand-accent/30 flex items-center justify-center font-bold text-brand-accentLight">
            {user.email[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-brand-textMain truncate leading-none mb-1">Authenticated</p>
            <p className="text-[10px] text-brand-textMuted truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 border border-brand-border/60 hover:border-red-500/30 hover:bg-red-500/5 text-xs text-brand-textMuted hover:text-red-400 rounded-xl font-medium transition-all"
        >
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
