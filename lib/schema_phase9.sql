-- =========================================================
-- Phase 9: Web-Strict Mode & Analytics — schema additions
-- Run AFTER schema_phase8.sql
-- =========================================================

-- Habits table
CREATE TABLE IF NOT EXISTS public.habits (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     text NOT NULL DEFAULT 'default',
  name        text NOT NULL,
  target_days int NOT NULL DEFAULT 90,
  emoji       text DEFAULT '⚡',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT habits_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- Habit logs (one row per completion per day)
CREATE TABLE IF NOT EXISTS public.habit_logs (
  id        uuid NOT NULL DEFAULT gen_random_uuid(),
  habit_id  uuid REFERENCES public.habits(id) ON DELETE CASCADE,
  logged_at date NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT habit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT habit_logs_unique UNIQUE (habit_id, logged_at)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS habit_logs_habit_id_idx ON public.habit_logs(habit_id);

-- RLS
ALTER TABLE public.habits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_habits"     ON public.habits     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_habit_logs" ON public.habit_logs FOR ALL USING (true) WITH CHECK (true);
