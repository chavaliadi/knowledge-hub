-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Entries Table
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  content text,
  type text not null check (type in ('note', 'bookmark', 'snippet', 'idea', 'resource')),
  url text,
  is_favorite boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Tags Table
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  unique (user_id, name)
);

-- Entry Tags (Join Table)
create table public.entry_tags (
  entry_id uuid references public.entries(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (entry_id, tag_id)
);

-- Enable Row Level Security (RLS)
alter table public.entries enable row level security;
alter table public.tags enable row level security;
alter table public.entry_tags enable row level security;

-- Policies for entries
create policy "Users can perform all actions on their own entries"
  on public.entries for all
  using (auth.uid() = user_id);

-- Policies for tags
create policy "Users can perform all actions on their own tags"
  on public.tags for all
  using (auth.uid() = user_id);

-- Policies for entry_tags
create policy "Users can access their own entry_tags mappings"
  on public.entry_tags for all
  using (
    exists (
      select 1 from public.entries 
      where public.entries.id = entry_tags.entry_id 
      and public.entries.user_id = auth.uid()
    )
  );
