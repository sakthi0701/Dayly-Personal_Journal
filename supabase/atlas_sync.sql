-- ============================================================
-- Dayly — Atlas → Dayly task mirror (one-way)
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- lib/atlas-sync.ts copies today's Atlas study tasks into `tasks`.
-- atlas_task_id = Atlas's study_tasks.id; NULL for every normal Dayly task.
-- UNIQUE stops the 07:00 cron and the "Sync from Atlas" button from
-- inserting the same Atlas task twice if they run at the same moment.
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS atlas_task_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_atlas_task_id_key') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_atlas_task_id_key UNIQUE (atlas_task_id);
  END IF;
END $$;
