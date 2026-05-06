-- Fix: recreate view as SECURITY INVOKER so RLS on trip_messages,
-- trip_conversations, and trips is enforced for the querying user.
CREATE OR REPLACE VIEW public.trip_messages_archive_candidates
WITH (security_invoker = true)
AS
SELECT *
FROM public.trip_messages
WHERE created_at < now() - interval '30 days'
  AND conversation_id IN (
    SELECT tc.id
    FROM public.trip_conversations tc
    JOIN public.trips t ON t.id = tc.trip_id
    WHERE t.status IN ('completed', 'cancelled', 'done', 'delivered')
  );

COMMENT ON VIEW public.trip_messages_archive_candidates IS
  'Messages >30d old on completed/cancelled trips — safe to move to cold storage.';
