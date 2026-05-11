-- Operations Island: trip health index + optional trip_messages.priority_weight
-- (App ranks using bootstrap + Realtime patches only — no extra SELECT from UI.)

-- Fleet idle / staleness probes: active movement statuses (no `on_route` literal in schema).
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trips_health_check
  ON public.trips (id, last_location_at)
  WHERE (
    status = ANY (
      ARRAY[
        'in_transit',
        'picked_up',
        'in_progress',
        'transit',
        'at_drop',
        'loading',
        'unloading',
        'at_pickup',
        'assigned',
        'active'
      ]::text[]
    )
  );

COMMENT ON INDEX public.idx_trips_health_check IS
  'Partial index for idle/stale location checks on in-flight trips (Operations Island / health RPCs).';

ALTER TABLE public.trip_messages
  ADD COLUMN IF NOT EXISTS priority_weight INTEGER NOT NULL DEFAULT 40;

COMMENT ON COLUMN public.trip_messages.priority_weight IS
  'Optional per-row priority for global ops ranking; client also applies heuristics by message_type.';
