export type EntryType = 'note' | 'bookmark' | 'snippet' | 'idea' | 'resource';

export type Tag = {
  id: string;
  name: string;
};

export type Collection = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type Entry = {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  type: EntryType;
  url: string | null;
  is_favorite: boolean;
  tags: Tag[];
  collection_id: string | null;
  collection_name: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateEntryInput = {
  title: string;
  content?: string;
  type: EntryType;
  url?: string;
  tag_ids: string[];
  collection_id?: string | null;
  is_pinned?: boolean;
};
