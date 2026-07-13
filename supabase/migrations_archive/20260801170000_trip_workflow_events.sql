-- Trip workflow events — event-driven continuation system.
-- Records every action taken after trip completion (invoice generated, POD uploaded, etc.).
-- Powers the TripContinuationCard and future AI copilot suggestions.

CREATE TABLE IF NOT EXISTS trip_workflow_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id     uuid        REFERENCES auth.users(id),
  event_type   text        NOT NULL,
  -- event_type values:
  --   'invoice.generated'   — client invoice created (client_price is the amount)
  --   'supplier.paid'       — supplier payment recorded
  --   'client.receipt_sent' — client receipt issued
  --   'pod.uploaded'        — proof of delivery document uploaded
  --   'trip.completed'      — trip marked completed (auto-inserted by trigger below)
  payload      jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_workflow_events_trip
  ON trip_workflow_events (trip_id, created_at DESC);

CREATE INDEX IF NOT EXISTS trip_workflow_events_org_type
  ON trip_workflow_events (org_id, event_type);

ALTER TABLE trip_workflow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_workflow_org_read"   ON trip_workflow_events;
DROP POLICY IF EXISTS "trip_workflow_org_insert"  ON trip_workflow_events;

CREATE POLICY "trip_workflow_org_read"
  ON trip_workflow_events FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "trip_workflow_org_insert"
  ON trip_workflow_events FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Trigger: auto-record trip.completed event when a trip's status changes to 'completed'.
CREATE OR REPLACE FUNCTION log_trip_completed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO trip_workflow_events (trip_id, org_id, actor_id, event_type, payload)
    VALUES (
      NEW.id,
      NEW.organization_id,
      auth.uid(),
      'trip.completed',
      jsonb_build_object(
        'client_price',   NEW.client_price,
        'supplier_rate',  NEW.supplier_rate,
        'completed_at',   NEW.completed_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_trip_completed ON trips;
CREATE TRIGGER trg_log_trip_completed
  AFTER UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION log_trip_completed();
