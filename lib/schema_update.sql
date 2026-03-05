-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Drop the old entries table and match function since we are changing dimensions
drop function if exists match_documents;
drop table if exists entries;

-- Recreate the table to store your journal entries with new Gemini dimensions
create table entries (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  embedding vector(768), -- Dimension for gemini-embedding-001 or text-embedding-004
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security (RLS)
alter table entries enable row level security;

-- Create a policy that allows anyone to insert/select for now (MVP)
create policy "Enable all access for now" on entries
  for all using (true) with check (true);

-- Recreate Similarity Search Function
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  similarity float
)
language plpgsql stable
as $$
begin
  return query
  select
    entries.id,
    entries.content,
    1 - (entries.embedding <=> query_embedding) as similarity
  from entries
  where 1 - (entries.embedding <=> query_embedding) > match_threshold
  order by entries.embedding <=> query_embedding
  limit match_count;
end;
$$;
