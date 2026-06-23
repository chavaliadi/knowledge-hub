-- Alter entries table to support AI Summarization and Auto-tagging
alter table public.entries 
  add column if not exists summary text,
  add column if not exists ai_tags text[];
