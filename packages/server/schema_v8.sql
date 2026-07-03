-- Create concept_links table
create table if not exists public.concept_links (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.entries(id) on delete cascade not null,
  target_id uuid references public.entries(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  relationship_type text not null,
  created_at timestamp with time zone default now(),
  unique (source_id, target_id, relationship_type)
);

-- Enable Row Level Security (RLS) on concept_links
alter table public.concept_links enable row level security;

-- Policies for concept_links
create policy "Users can perform all actions on their own concept links"
  on public.concept_links for all
  using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists concept_links_source_idx on public.concept_links (source_id);
create index if not exists concept_links_target_idx on public.concept_links (target_id);
create index if not exists concept_links_user_idx on public.concept_links (user_id);
