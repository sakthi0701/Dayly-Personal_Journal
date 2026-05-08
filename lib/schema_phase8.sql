-- =========================================================
-- Phase 8: Flow State Engine — time_blocks table
-- Run this in the Supabase SQL editor AFTER schema_phase7.sql
-- =========================================================

CREATE TABLE IF NOT EXISTS public.time_blocks (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id         uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  mode            text NOT NULL DEFAULT 'pomodoro' CHECK (mode IN ('pomodoro', 'stopwatch')),
  start_time      timestamptz NOT NULL DEFAULT now(),
  end_time        timestamptz,
  duration        int,                  -- seconds elapsed at session end
  completed       boolean DEFAULT false,
  -- Phase 9 columns (added early so GlobalDashboardStats doesn't break)
  strict_mode     boolean DEFAULT false,
  violation_count int DEFAULT 0,
  failed_reason   text,                 -- 'tab_switched' | 'manual_abandon' | null
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT time_blocks_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- Index for fast task-based lookups
CREATE INDEX IF NOT EXISTS time_blocks_task_id_idx ON public.time_blocks(task_id);
CREATE INDEX IF NOT EXISTS time_blocks_created_at_idx ON public.time_blocks(created_at DESC);

-- RLS (open for MVP — lock down when auth is added)
ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_time_blocks" ON public.time_blocks FOR ALL USING (true) WITH CHECK (true);
