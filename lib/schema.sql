-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table to store your journal entries
create table if not exists entries (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  embedding vector(768), -- Gemini text-embedding-001 (768 dims). NOTE: If migrating from all-MiniLM-L6-v2 (384 dims), run: ALTER TABLE entries DROP COLUMN embedding; ALTER TABLE entries ADD COLUMN embedding vector(768);
  mood varchar(50),
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security (RLS)
alter table entries enable row level security;

-- Create a policy that allows anyone to insert/select for now (MVP)
-- Ideally, you'd restrict this to authenticated users later
drop policy if exists "Enable all access for now" on entries;
create policy "Enable all access for now" on entries
  for all using (true) with check (true);

-- Phase 5: Mem0 OSS Vector Store Integration

-- Create the memories table (using 768 dimensions for Gemini)
create table if not exists memories (
  id text primary key,
  embedding vector(768),
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

-- Create the memory migrations table
create table if not exists memory_migrations (
  user_id text primary key,
  created_at timestamp with time zone default timezone('utc', now())
);

-- Create the history table for Mem0
create table if not exists history (
  id text primary key,
  memory_id text not null,
  previous_value text,
  new_value text,
  action text not null,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone,
  is_deleted integer default 0
);

-- Create the vector similarity search function for Mem0
create or replace function match_vectors(
  query_embedding vector(768),
  match_count int,
  filter jsonb default '{}'::jsonb
)
returns table (
  id text,
  similarity float,
  metadata jsonb
)
language plpgsql
as $$
begin
  return query
  select
    t.id::text,
    1 - (t.embedding <=> query_embedding) as similarity,
    t.metadata
  from memories t
  where case
    when filter::text = '{}'::text then true
    else t.metadata @> filter
  end
  order by t.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Phase 2: Gamification Schema
DO $$ BEGIN
    CREATE TYPE avatar_state AS ENUM ('sun', 'ice', 'dormant');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

create table if not exists user_stats (
    id uuid default gen_random_uuid() primary key,
    -- In a real app, you would have a user_id referencing auth.users
    -- user_id uuid references auth.users not null,
    streak_days int default 0 not null,
    longest_streak int default 0 not null,
    streak_start_date timestamp with time zone,
    total_entries int default 0 not null,
    xp int default 0 not null,
    last_entry_date timestamp with time zone,
    user_timezone varchar(50) default 'UTC' not null,
    current_avatar_state avatar_state default 'dormant' not null,
    has_onboarded boolean default false not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table user_stats enable row level security;

drop policy if exists "Enable all access for now on user_stats" on user_stats;
create policy "Enable all access for now on user_stats" on user_stats
  for all using (true) with check (true);

-- MVP: Insert a default row so we always have one record to update
insert into user_stats (user_timezone, current_avatar_state)
values ('UTC', 'dormant')
on conflict do nothing;
