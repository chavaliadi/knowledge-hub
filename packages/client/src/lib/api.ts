import { Entry, Tag, CreateEntryInput } from './types';
import { INITIAL_MOCK_ENTRIES, MOCK_TAGS } from './mockData';

// Helper to initialize local storage
const getStoredEntries = (): Entry[] => {
  const stored = localStorage.getItem('kh_entries');
  if (!stored) {
    localStorage.setItem('kh_entries', JSON.stringify(INITIAL_MOCK_ENTRIES));
    return INITIAL_MOCK_ENTRIES;
  }
  return JSON.parse(stored);
};

const getStoredTags = (): Tag[] => {
  const stored = localStorage.getItem('kh_tags');
  if (!stored) {
    localStorage.setItem('kh_tags', JSON.stringify(MOCK_TAGS));
    return MOCK_TAGS;
  }
  return JSON.parse(stored);
};

const setStoredEntries = (entries: Entry[]) => {
  localStorage.setItem('kh_entries', JSON.stringify(entries));
};

const setStoredTags = (tags: Tag[]) => {
  localStorage.setItem('kh_tags', JSON.stringify(tags));
};

export const api = {
  // Entries API
  getEntries: async (filters?: { type?: string; tag?: string }): Promise<Entry[]> => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 150));
    let entries = getStoredEntries();
    
    if (filters?.type) {
      entries = entries.filter((e) => e.type === filters.type);
    }
    if (filters?.tag) {
      entries = entries.filter((e) => e.tags.some((t) => t.name.toLowerCase() === filters.tag?.toLowerCase()));
    }
    
    return entries;
  },

  getEntryById: async (id: string): Promise<Entry | null> => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const entries = getStoredEntries();
    return entries.find((e) => e.id === id) || null;
  },

  createEntry: async (input: CreateEntryInput): Promise<Entry> => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const entries = getStoredEntries();
    const tags = getStoredTags();
    
    // Resolve tags from tag_ids
    const entryTags = tags.filter((t) => input.tag_ids.includes(t.id));
    
    const newEntry: Entry = {
      id: 'entry_' + Math.random().toString(36).substr(2, 9),
      user_id: 'user_default',
      title: input.title,
      content: input.content || null,
      type: input.type,
      url: input.url || null,
      is_favorite: false,
      tags: entryTags,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    entries.unshift(newEntry);
    setStoredEntries(entries);
    return newEntry;
  },

  updateEntry: async (id: string, input: CreateEntryInput): Promise<Entry> => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const entries = getStoredEntries();
    const tags = getStoredTags();
    
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) throw new Error('Entry not found');
    
    const entryTags = tags.filter((t) => input.tag_ids.includes(t.id));
    
    const updatedEntry: Entry = {
      ...entries[index]!,
      title: input.title,
      content: input.content || null,
      type: input.type,
      url: input.url || null,
      tags: entryTags,
      updated_at: new Date().toISOString()
    };
    
    entries[index] = updatedEntry;
    setStoredEntries(entries);
    return updatedEntry;
  },

  deleteEntry: async (id: string): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const entries = getStoredEntries();
    const filtered = entries.filter((e) => e.id !== id);
    setStoredEntries(filtered);
  },

  toggleFavorite: async (id: string): Promise<Entry> => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const entries = getStoredEntries();
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) throw new Error('Entry not found');
    
    const updated = {
      ...entries[index]!,
      is_favorite: !entries[index]!.is_favorite,
      updated_at: new Date().toISOString()
    };
    entries[index] = updated;
    setStoredEntries(entries);
    return updated;
  },

  // Tags API
  getTags: async (): Promise<Tag[]> => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return getStoredTags();
  },

  createTag: async (name: string): Promise<Tag> => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const tags = getStoredTags();
    
    // Check if tag already exists (case-insensitive)
    const existing = tags.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    
    const newTag: Tag = {
      id: 'tag_' + Math.random().toString(36).substr(2, 9),
      name: name.trim().toLowerCase()
    };
    
    tags.push(newTag);
    setStoredTags(tags);
    return newTag;
  },

  deleteTag: async (id: string): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const tags = getStoredTags();
    const filteredTags = tags.filter((t) => t.id !== id);
    setStoredTags(filteredTags);
    
    // Also remove tag references from all entries
    const entries = getStoredEntries();
    const updatedEntries = entries.map((entry) => ({
      ...entry,
      tags: entry.tags.filter((t) => t.id !== id)
    }));
    setStoredEntries(updatedEntries);
  },

  // Search API
  searchEntries: async (q: string, type?: string, tagId?: string): Promise<Entry[]> => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const entries = getStoredEntries();
    const query = q.toLowerCase().trim();
    
    return entries.filter((e) => {
      // Text Match
      const matchesText = !query || 
        e.title.toLowerCase().includes(query) || 
        (e.content && e.content.toLowerCase().includes(query)) ||
        (e.url && e.url.toLowerCase().includes(query));
        
      // Type Match
      const matchesType = !type || e.type === type;
      
      // Tag Match
      const matchesTag = !tagId || e.tags.some((t) => t.id === tagId);
      
      return matchesText && matchesType && matchesTag;
    });
  }
};
