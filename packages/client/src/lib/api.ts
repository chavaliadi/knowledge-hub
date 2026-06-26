import { Entry, Tag, Collection, CreateEntryInput } from './types';
import { supabase } from './supabase';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Helper to fetch authorization header for current session
const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': session ? `Bearer ${session.access_token}` : '',
  };
};

export const api = {
  // Entries API
  getEntries: async (filters?: { type?: string; tag?: string; collectionId?: string }): Promise<Entry[]> => {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (filters?.type) {
      params.append('type', filters.type);
    }
    if (filters?.tag) {
      params.append('tag', filters.tag);
    }
    if (filters?.collectionId) {
      params.append('collectionId', filters.collectionId);
    }
    
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${BASE_URL}/entries${queryStr}`, { headers });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  getEntryById: async (id: string): Promise<Entry | null> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/entries/${id}`, { headers });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  createEntry: async (input: CreateEntryInput): Promise<Entry> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/entries`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input)
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  updateEntry: async (id: string, input: CreateEntryInput): Promise<Entry> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/entries/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(input)
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  deleteEntry: async (id: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/entries/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
  },

  toggleFavorite: async (id: string): Promise<Entry> => {
    const entry = await api.getEntryById(id);
    if (!entry) {
      throw new Error('Entry not found');
    }
    
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/entries/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        is_favorite: !entry.is_favorite
      })
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  togglePin: async (id: string): Promise<Entry> => {
    const entry = await api.getEntryById(id);
    if (!entry) {
      throw new Error('Entry not found');
    }
    
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/entries/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        is_pinned: !entry.is_pinned
      })
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  // Tags API
  getTags: async (): Promise<Tag[]> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/tags`, { headers });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  createTag: async (name: string): Promise<Tag> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/tags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  deleteTag: async (id: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/tags/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
  },

  // Collections API
  getCollections: async (): Promise<Collection[]> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/collections`, { headers });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  createCollection: async (name: string): Promise<Collection> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  deleteCollection: async (id: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/collections/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
  },

  // Search API
  searchEntries: async (q: string, type?: string, tagId?: string, collectionId?: string, ai?: boolean): Promise<Entry[]> => {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (q) {
      params.append('q', q);
    }
    if (type) {
      params.append('type', type);
    }
    if (tagId) {
      params.append('tagId', tagId);
    }
    if (collectionId) {
      params.append('collectionId', collectionId);
    }
    if (ai) {
      params.append('ai', 'true');
    }
    
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${BASE_URL}/search${queryStr}`, { headers });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  // Related Entries API
  getRelatedEntries: async (id: string): Promise<Entry[]> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/entries/${id}/related`, { headers });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  },

  // Duplicate Check API
  checkDuplicate: async (title: string, content: string): Promise<Entry | null> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}/entries/check-duplicate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, content })
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = await res.json();
    return data.duplicate;
  },

  // Intelligence Dashboard API
  getIntelligenceReport: async (refresh?: boolean): Promise<any> => {
    const headers = await getAuthHeaders();
    const query = refresh ? '?refresh=true' : '';
    const res = await fetch(`${BASE_URL}/intelligence${query}`, { headers });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  }
};
