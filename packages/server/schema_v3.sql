-- Create attachments table
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  entry_id uuid references public.entries(id) on delete cascade not null,
  file_path text not null,
  file_name text not null,
  file_size integer not null,
  mime_type text not null,
  created_at timestamp with time zone default now()
);

-- Enable RLS on attachments
alter table public.attachments enable row level security;

-- RLS Policy: Users can only see, create, modify, or delete their own attachments
create policy "Users can perform all actions on their own attachments"
  on public.attachments for all
  using (auth.uid() = user_id);
