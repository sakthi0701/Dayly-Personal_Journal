-- ============================================================
-- Dayly — Phase 11 Pre-work Migrations
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ── 1. Fix missing habit_type column ─────────────────────────
ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS habit_type text NOT NULL DEFAULT 'good'
    CHECK (habit_type IN ('good', 'bad'));

-- ── 2. Sensei thread history ──────────────────────────────────

CREATE TABLE IF NOT EXISTS sensei_threads (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         text NOT NULL DEFAULT 'default',
  title           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  last_message_at timestamptz DEFAULT now()
);
ALTER TABLE sensei_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sensei_threads_all" ON sensei_threads
  FOR ALL USING (true) WITH CHECK (true);

-- ── 3. Sensei messages (with optional embedding for future RAG) ─
-- Requires pgvector extension (already enabled from Phase 6).
CREATE TABLE IF NOT EXISTS sensei_messages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id  uuid REFERENCES sensei_threads(id) ON DELETE CASCADE,
  user_id    text NOT NULL DEFAULT 'default',
  role       text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content    text NOT NULL,
  embedding  vector(768),   -- Gemini text-embedding-004 — populate async, nullable
  metadata   jsonb,         -- optional: { mode, question, executionSummary }
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sensei_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sensei_messages_all" ON sensei_messages
  FOR ALL USING (true) WITH CHECK (true);

-- Index for fast thread message retrieval
CREATE INDEX IF NOT EXISTS sensei_messages_thread_idx
  ON sensei_messages (thread_id, created_at);

-- Vector similarity index (IVFFlat — good for up to ~1M rows)
-- Only create after you have at least a few hundred rows
-- CREATE INDEX IF NOT EXISTS sensei_messages_embedding_idx
--   ON sensei_messages USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- ── 4. Helper function: match_sensei_messages ─────────────────
-- Used for RAG retrieval of relevant past Sensei exchanges.
CREATE OR REPLACE FUNCTION match_sensei_messages(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count     int   DEFAULT 5
)
RETURNS TABLE (
  id        uuid,
  thread_id uuid,
  role      text,
  content   text,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    sm.id,
    sm.thread_id,
    sm.role,
    sm.content,
    sm.created_at,
    1 - (sm.embedding <=> query_embedding) AS similarity
  FROM sensei_messages sm
  WHERE sm.embedding IS NOT NULL
    AND sm.role = 'assistant'
    AND 1 - (sm.embedding <=> query_embedding) > match_threshold
  ORDER BY sm.embedding <=> query_embedding
  LIMIT match_count;
$$;
