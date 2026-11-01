-- ============================================================
-- Dayly — per-minute Telegram reminders (break-over pings + bot reminders)
-- Run in Supabase Dashboard → SQL Editor, AFTER cron_tick.sql
-- (reuses the 'dayly_cron_secret' Vault secret created there).
--
-- Every minute Postgres checks telegram_reminders itself and only calls
-- Vercel when something is due — idle minutes make no HTTP request.
-- ============================================================

SELECT cron.unschedule('dayly-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dayly-reminders');

SELECT cron.schedule(
  'dayly-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dayly7.vercel.app/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dayly_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  WHERE EXISTS (
    SELECT 1 FROM public.telegram_reminders WHERE is_active AND remind_at <= now()
  );
  $$
);

-- A per-minute job adds ~1,440 rows/day to cron.job_run_details — keep 3 days.
SELECT cron.unschedule('dayly-cron-cleanup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dayly-cron-cleanup');
SELECT cron.schedule(
  'dayly-cron-cleanup',
  '0 3 * * *',
  $$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days' $$
);
