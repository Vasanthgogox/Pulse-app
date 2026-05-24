-- Add idempotency_key to trip_workflow_events.
-- Deterministic key for single-occurrence events: "{trip_id}:{event_type}".
-- Multi-occurrence events (partial payments) leave it NULL.
-- UNIQUE index on non-null keys: DB-level deduplication.
-- Client receives error code 23505 on duplicate → safe to treat as no-op.

ALTER TABLE trip_workflow_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS trip_workflow_events_idempotency_key_unique
  ON trip_workflow_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Backfill existing single-occurrence events that don't have a key yet.
-- Safe because the unique index is partial (WHERE NOT NULL) so nulls are ignored.
UPDATE trip_workflow_events
SET idempotency_key = trip_id::text || ':' || event_type
WHERE idempotency_key IS NULL
  AND event_type IN (
    'trip.completed',
    'pod.uploaded',
    'invoice.generated',
    'supplier.payment_recorded',
    'client.payment_received'
  );

-- pg_notify trigger: frontend subscriptions get instant push on any new event.
-- realtimeRegistry uses Postgres CDC (replica identity) for the subscription,
-- so this is a belt-and-suspenders notification for Edge Function orchestration.
CREATE OR REPLACE FUNCTION notify_trip_workflow_event()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  PERFORM pg_notify(
    'trip_workflow',
    json_build_object(
      'trip_id',    NEW.trip_id,
      'org_id',     NEW.org_id,
      'event_type', NEW.event_type,
      'event_id',   NEW.id
    )::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_trip_workflow_event ON trip_workflow_events;
CREATE TRIGGER trg_notify_trip_workflow_event
  AFTER INSERT ON trip_workflow_events
  FOR EACH ROW EXECUTE FUNCTION notify_trip_workflow_event();
