-- Location logs: structured payload on `system_log` rows (`metadata.event_payload.location_data`).
-- Partial GIN keeps the index small and write-friendly vs indexing all message types.
-- No triggers: the app inserts `trip_messages` directly (see driver cycle / heartbeat).

CREATE INDEX IF NOT EXISTS idx_trip_messages_location_logs
  ON public.trip_messages
  USING GIN ((metadata -> 'event_payload'))
  WHERE (message_type = 'system_log');

COMMENT ON INDEX public.idx_trip_messages_location_logs IS
  'JSONB path for queries on system_log event_payload (e.g. location_data). Partial for write cost.';

-- Latest location_data for a trip (join conversations — trip_messages has no trip_id column).
CREATE OR REPLACE FUNCTION public.get_last_trip_location(p_trip_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT tm.metadata -> 'event_payload' -> 'location_data'
  FROM public.trip_messages tm
  INNER JOIN public.trip_conversations tc ON tc.id = tm.conversation_id
  WHERE tc.trip_id = p_trip_id
    AND tm.message_type = 'system_log'
    AND (tm.metadata -> 'event_payload') ? 'location_data'
  ORDER BY tm.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_last_trip_location(UUID) IS
  'Returns the most recent system_log location_data JSON for bootstrap / map header.';
