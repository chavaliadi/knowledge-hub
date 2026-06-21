-- Enable pgvector extension
create extension if not exists vector;

-- Add embedding column with 768 dimensions (for gemini-embedding-001 with outputDimensionality: 768)
alter table public.entries 
  add column if not exists embedding vector(768);

-- Create HNSW index for fast cosine distance queries
create index if not exists entries_embedding_hnsw_idx 
  on public.entries 
  using hnsw (embedding vector_cosine_ops);

-- Define match_entries search RPC function
create or replace function match_entries (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_type text default null,
  filter_collection_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  content text,
  type text,
  url text,
  is_favorite boolean,
  collection_id uuid,
  is_pinned boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    entries.id,
    entries.user_id,
    entries.title,
    entries.content,
    entries.type,
    entries.url,
    entries.is_favorite,
    entries.collection_id,
    entries.is_pinned,
    entries.created_at,
    entries.updated_at,
    1 - (entries.embedding <=> query_embedding) as similarity
  from entries
  where entries.user_id = auth.uid()
    and (filter_type is null or entries.type = filter_type)
    and (filter_collection_id is null or entries.collection_id = filter_collection_id)
    and 1 - (entries.embedding <=> query_embedding) > match_threshold
  order by entries.is_pinned desc, entries.embedding <=> query_embedding
  limit match_count;
end;
$$;
