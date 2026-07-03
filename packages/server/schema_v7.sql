-- Create entry_chunks table
create table if not exists public.entry_chunks (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.entries(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(768),
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security (RLS) on entry_chunks
alter table public.entry_chunks enable row level security;

-- Policies for entry_chunks
create policy "Users can perform all actions on their own entry chunks"
  on public.entry_chunks for all
  using (auth.uid() = user_id);

-- Create HNSW index for fast cosine distance queries on chunk embeddings
create index if not exists entry_chunks_embedding_hnsw_idx 
  on public.entry_chunks 
  using hnsw (embedding vector_cosine_ops);

-- Index on entry_id for cascade deletes and parent lookups
create index if not exists entry_chunks_entry_id_idx 
  on public.entry_chunks (entry_id);

-- Define match_chunks function to retrieve raw chunk segments for RAG chat
create or replace function match_chunks (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  entry_id uuid,
  user_id uuid,
  chunk_index int,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    entry_chunks.id,
    entry_chunks.entry_id,
    entry_chunks.user_id,
    entry_chunks.chunk_index,
    entry_chunks.content,
    1 - (entry_chunks.embedding <=> query_embedding) as similarity
  from entry_chunks
  where entry_chunks.user_id = auth.uid()
    and 1 - (entry_chunks.embedding <=> query_embedding) > match_threshold
  order by entry_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
