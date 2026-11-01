-- ============================================================
-- Dayly — scheduled Telegram check-ins via Supabase pg_cron
-- Run in Supabase Dashboard → SQL Editor.
--
-- Pings https://dayly7.vercel.app/api/cron/tick every 30 minutes.
-- All logic (LLM check-ins, deadline alerts, reminders) lives in that route.
-- Replaces the AWS Lambda + EventBridge setup in telegram-lambda/.
--
-- Before running: replace <CRON_SECRET> with the same value you set as the
-- CRON_SECRET env var in Vercel (generate one: `openssl rand -hex 32`).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store the secret in Vault rather than inline in the job definition
SELECT vault.create_secret('<CRON_SECRET>', 'dayly_cron_secret');

-- Re-running this file replaces the job instead of duplicating it
SELECT cron.unschedule('dayly-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dayly-tick');

SELECT cron.schedule(
  'dayly-tick',
  '*/30 * * * *',  -- UTC :00/:30 = IST :30/:00
  $$
  SELECT net.http_post(
    url     := 'https://dayly7.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'dayly_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- ── Checking it works ────────────────────────────────────────────────────────
-- Did the job run?
--   SELECT status, return_message, start_time FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'dayly-tick')
--   ORDER BY start_time DESC LIMIT 5;
-- What did Vercel answer? (expect 202; 401 = secret mismatch)
--   SELECT status_code, content, created FROM net._http_response ORDER BY created DESC LIMIT 5;
