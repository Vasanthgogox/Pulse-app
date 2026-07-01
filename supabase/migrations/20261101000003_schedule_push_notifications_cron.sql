-- Schedule send-push-notifications edge function to run every 2 minutes via pg_cron.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'send-push-notifications',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/send-push-notifications',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
