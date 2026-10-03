-- ============================================================
-- Dayly Telegram AI Agent — Database Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Conversation history (enables coreference resolution + continuity)
CREATE TABLE IF NOT EXISTS telegram_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text        NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_time
  ON telegram_messages(created_at DESC);

-- 2. Idempotency — deduplicate Telegram webhook retries
CREATE TABLE IF NOT EXISTS telegram_processed_updates (
  update_id    bigint      PRIMARY KEY,
  processed_at timestamptz DEFAULT now()
);

-- Auto-purge old idempotency records after 3 days (safe to delete)
-- Run manually or schedule via pg_cron:
-- DELETE FROM telegram_processed_updates WHERE processed_at < now() - interval '3 days';

-- 3. Dynamic reminders — created by the AI agent on request
CREATE TABLE IF NOT EXISTS telegram_reminders (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  label               text        NOT NULL,
  message             text        NOT NULL,
  remind_at           timestamptz NOT NULL,  -- next fire time (UTC, represents IST intent)
  is_recurring        boolean     DEFAULT false,
  recur_every_minutes integer,               -- 60=hourly, 1440=daily, 10080=weekly
  is_active           boolean     DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  last_sent_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_telegram_reminders_fire
  ON telegram_reminders(remind_at) WHERE is_active = true;
