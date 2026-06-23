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

export type Attachment = {
  id: string;
  user_id: string;
  entry_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
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
  attachments: Attachment[];
  similarity?: number;
  summary?: string | null;
  ai_tags?: string[] | null;
  created_at: string;
  updated_at: string;
};

export type CreateAttachmentInput = {
  file_name: string;
  file_size: number;
  mime_type: string;
  file_path: string;
};

export type CreateEntryInput = {
  title: string;
  content?: string;
  type: EntryType;
  url?: string;
  tag_ids: string[];
  collection_id?: string | null;
  is_pinned?: boolean;
  attachments?: CreateAttachmentInput[];
};
