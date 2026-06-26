-- Add domains column to public.entries
alter table public.entries 
  add column if not exists domains text[];

-- Create index on domains for faster array searching
create index if not exists entries_domains_idx 
  on public.entries 
  using gin (domains);

-- Create knowledge_reports cache table
create table if not exists public.knowledge_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  generated_at timestamp with time zone default now() not null,
  overall_score integer not null,
  domain_scores jsonb not null,
  missing_topics text[] not null,
  insights text not null
);

-- Enable RLS on knowledge_reports
alter table public.knowledge_reports enable row level security;

-- Policies for knowledge_reports
create policy "Users can perform all actions on their own knowledge reports"
  on public.knowledge_reports for all
  using (auth.uid() = user_id);
