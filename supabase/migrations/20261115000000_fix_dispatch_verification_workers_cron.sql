-- =============================================================================
-- Fix dispatch_verification_workers cron job: NULL url crash every run
-- =============================================================================
-- The job built its URL from current_setting('app.supabase_url', true), which
-- was never configured at the database level — NULL || '/functions/v1/...'
-- evaluates to NULL in Postgres, so every net.http_post() call violated the
-- NOT NULL constraint on http_request_queue.url. This ran every minute
-- (schedule '* * * * *'), so it silently failed ~1440 times/day and no
-- verification_jobs row was ever actually dispatched to verification-worker.
--
-- Fix: hardcode the project URL (public, not secret — same pattern already
-- used by the send-push-notifications job) and read the service role key
-- from vault.decrypted_secrets instead of the unset current_setting.

SELECT cron.alter_job(
  job_id := 3,
  command := $cmd$
        SELECT net.http_post(
          url     := 'https://nafxpivddesgsrthmosv.supabase.co/functions/v1/verification-worker',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
          ),
          body    := jsonb_build_object('job_id', j.id, 'organization_id', j.organization_id)
        )
        FROM public.verification_jobs j
        WHERE j.status IN ('QUEUED', 'PARTIAL_REVIEW')
          AND j.attempts < 4
          AND j.next_attempt_at <= now()
        LIMIT 5;
      $cmd$
);
