-- ============================================================
-- Phase 7: Task Engine Schema
-- Run this in the Supabase SQL editor (paste and click Run)
-- ============================================================

-- 1. Tags dictionary
-- -------------------
CREATE TABLE IF NOT EXISTS public.tags (
  id   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE
) TABLESPACE pg_default;

-- 2. Core task table
-- -------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             text NOT NULL DEFAULT 'default',
  title               text NOT NULL,
  notes               text,
  status              text NOT NULL DEFAULT 'todo'
                      CHECK (status IN ('todo', 'in-progress', 'done')),
  priority            text NOT NULL DEFAULT 'none'
                      CHECK (priority IN ('high', 'medium', 'none')),
  estimated_pomodoros int DEFAULT 1,
  elapsed_pomodoros   int DEFAULT 0,
  due_date            date,
  is_recurring        boolean DEFAULT false,
  recurrence_rule     text,   -- e.g. 'daily', 'weekly'
  parent_task_id      uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  position            int DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
) TABLESPACE pg_default;

-- Row Level Security (open policy — swap for auth.uid() when auth is added)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_all" ON public.tasks FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at on every PATCH
CREATE OR REPLACE FUNCTION public.update_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_updated_at_trigger
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_tasks_updated_at();

-- 3. Many-to-many: tasks ↔ tags
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.task_tags (
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id  uuid REFERENCES public.tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
) TABLESPACE pg_default;

-- 4. Useful index for subtask queries
CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
