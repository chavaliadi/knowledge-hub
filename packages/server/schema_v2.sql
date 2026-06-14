-- Create collections table
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  created_at timestamp with time zone default now(),
  unique (user_id, name)
);

-- Enable RLS on collections
alter table public.collections enable row level security;

-- Policy for collections
create policy "Users can perform all actions on their own collections"
  on public.collections for all
  using (auth.uid() = user_id);

-- Alter entries table to support collection references and pinning
alter table public.entries 
  add column if not exists collection_id uuid references public.collections(id) on delete set null,
  add column if not exists is_pinned boolean default false;
