-- ============================================================
-- Dayly — Remote timer (Telegram bot → app)
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- The app's timer lives in the browser (localStorage), so the Telegram bot
-- can't reach it directly. When the bot starts a focus/break timer it writes
-- the session here; every open app polls /api/timer/remote and takes over
-- the session (same remaining time, task, not-to-dos).
--
-- Single row (id = 1): only one remote session exists at a time.
--   session_id      — changes on every start; apps adopt each session once
--   status          — 'running' until the app finishes it or the bot stops it
--   block_id        — time_blocks row (focus only), so stats save normally
--   end_reminder_id — telegram_reminders row that pings when the timer ends
-- ============================================================

CREATE TABLE IF NOT EXISTS remote_timer (
  id               smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  session_id       uuid        NOT NULL DEFAULT gen_random_uuid(),
  kind             text        NOT NULL CHECK (kind IN ('focus', 'break')),
  status           text        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ended')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer     NOT NULL CHECK (duration_seconds > 0),
  block_id         text,
  task_id          text,
  task_title       text,
  strict_mode      boolean     NOT NULL DEFAULT false,
  not_to_do        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  end_reminder_id  text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
