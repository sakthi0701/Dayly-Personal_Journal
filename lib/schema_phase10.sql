-- =========================================================
-- Phase 10: AI Sensei v2 — Holistic Psychologist
-- Run AFTER schema_phase9.sql (additive, safe on existing data)
-- Paste this entire file into the Supabase SQL editor and click Run.
-- =========================================================

-- 1. Goals table (OKR-style with optional hierarchy)
-- ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goals (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id        text NOT NULL DEFAULT 'default',
  title          text NOT NULL,
  deadline       date,
  parent_goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goals_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals_all" ON public.goals FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS goals_user_id_idx        ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS goals_status_idx         ON public.goals(status);
CREATE INDEX IF NOT EXISTS goals_parent_goal_id_idx ON public.goals(parent_goal_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_goals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'goals_updated_at_trigger'
  ) THEN
    CREATE TRIGGER goals_updated_at_trigger
      BEFORE UPDATE ON public.goals
      FOR EACH ROW EXECUTE FUNCTION public.update_goals_updated_at();
  END IF;
END;
$$;

-- 2. Add goal_id FK to tasks (NULL-safe — existing rows default to orphan)
-- -------------------------------------------------------------------------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_goal_id_idx ON public.tasks(goal_id);

-- 3. Augment habits table with color and frequency
-- -------------------------------------------------
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon        text    DEFAULT '✨',
  ADD COLUMN IF NOT EXISTS color       text    DEFAULT 'indigo',
  ADD COLUMN IF NOT EXISTS frequency   jsonb   DEFAULT '{"type":"daily"}'::jsonb,
  ADD COLUMN IF NOT EXISTS goal_value  int     DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit        text    DEFAULT 'times';

-- 4. Add status to habit_logs (keeps existing logged_at column intact)
-- --------------------------------------------------------------------
ALTER TABLE public.habit_logs
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'success'
  CHECK (status IN ('success', 'failed', 'skipped'));
