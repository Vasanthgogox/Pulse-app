-- Phase 2A of the Driver Execution Platform: wire geofence_events into the
-- existing tracking/checkpoint pipeline. Writers only — no UI, no timeline,
-- no consumers. See features/trips/domain/tripStage.ts for the stage model
-- this will eventually feed.
--
-- geofence_events (enter_pickup/exit_pickup/enter_drop/exit_drop) has existed
-- since 20260802130000_tracking_realtime_subsystem.sql with an INSERT policy,
-- but nothing has ever written to it — this is the first writer.
--
-- Design:
--   - Detection runs inside tracking_record_checkpoint(), the single RPC every
--     GPS fix already passes through (both the sparse "presence only" early
--     return AND the full checkpoint-write path) — a geofence transition must
--     be checked on every fix, not only ones that pass the 50m/30s movement
--     gate, since a driver arriving and stopping is exactly the case where
--     checkpoint writes go quiet.
--   - Current inside/outside state is derived by reading the most recent
--     geofence_events row for the trip+side (not a new column) — the event
--     log is its own state store, so a transition only fires on a genuine
--     flip, giving duplicate suppression for free.
--   - Asymmetric hysteresis (enter at 300m, must clear 450m to exit) absorbs
--     GPS jitter right at a single boundary. Radii are named constants here,
--     not persisted per-trip; revisit if a future trip type needs tuning.
--   - Only trips.pickup_lat/pickup_lon/drop_lat/drop_lon are used (never the
--     client-side popular-places fallback in getTripStopCoordinate) — those
--     are sometimes a city-level guess when the DB has no exact coordinate,
--     and a city centroid is not a safe geofence center. Detection is skipped
--     entirely for a side with no stored coordinate.
--   - Concurrency: two overlapping calls for the SAME driver are naturally
--     serialized by ordinary Postgres row locking, not an explicit lock here.
--     Every call path upserts driver_presence (PK = driver_id) BEFORE calling
--     this function, so a second concurrent transaction for that driver
--     blocks on that row until the first commits. Verified under a 1s
--     artificial delay in Phase 2B testing: exactly one event was written
--     for two truly concurrent fixes. This only holds as long as the
--     presence upsert keeps happening before this call in
--     tracking_record_checkpoint — do not reorder that.
--   - Out-of-order / offline-replayed fixes (Phase 2B finding): a late-
--     arriving fix with an OLDER recorded_at than events already in the
--     table must be judged against the state that existed as of ITS OWN
--     timestamp, not whatever is currently latest in the table -- so the
--     "last state" lookup filters to recorded_at < p_recorded_at. That alone
--     isn't sufficient though: an already-inserted later fix may now be a
--     stale duplicate of the same type with no intervening opposite-type
--     event, so each insert is followed by a cleanup delete enforcing the
--     enter/exit-must-alternate invariant on the trip+side going forward
--     from this fix. This does not repair every possible reorder pattern
--     (e.g. multiple wildly out-of-order fixes in one burst), just the
--     common single-late-fix case exercised in testing.

CREATE OR REPLACE FUNCTION public.tracking_detect_geofence_transition(
  p_trip_id     uuid,
  p_driver_id   uuid,
  p_org_id      uuid,
  p_latitude    double precision,
  p_longitude   double precision,
  p_recorded_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup_lat   double precision;
  v_pickup_lon   double precision;
  v_drop_lat     double precision;
  v_drop_lon     double precision;
  v_dist_m       double precision;
  v_last_event   text;
  v_was_inside   boolean;
  v_enter_radius constant double precision := 300;
  v_exit_radius  constant double precision := 450;
BEGIN
  SELECT pickup_lat, pickup_lon, drop_lat, drop_lon
  INTO   v_pickup_lat, v_pickup_lon, v_drop_lat, v_drop_lon
  FROM   public.trips
  WHERE  id = p_trip_id;

  -- ── Pickup side ──────────────────────────────────────────────────────────
  IF v_pickup_lat IS NOT NULL AND v_pickup_lon IS NOT NULL THEN
    v_dist_m := (
      6371000 * 2 * asin(sqrt(
        power(sin(radians(p_latitude - v_pickup_lat) / 2), 2) +
        cos(radians(v_pickup_lat)) * cos(radians(p_latitude)) *
        power(sin(radians(p_longitude - v_pickup_lon) / 2), 2)
      ))
    );

    SELECT event_type INTO v_last_event
    FROM public.geofence_events
    WHERE trip_id = p_trip_id AND event_type IN ('enter_pickup', 'exit_pickup')
      AND recorded_at < p_recorded_at
    ORDER BY recorded_at DESC
    LIMIT 1;

    v_was_inside := COALESCE(v_last_event = 'enter_pickup', false);

    IF NOT v_was_inside AND v_dist_m <= v_enter_radius THEN
      INSERT INTO public.geofence_events
        (trip_id, driver_id, organization_id, event_type, latitude, longitude, recorded_at)
      VALUES
        (p_trip_id, p_driver_id, p_org_id, 'enter_pickup', p_latitude, p_longitude, p_recorded_at);
      -- Collapse now-stale duplicate 'enter_pickup' rows a previously
      -- (chronologically later, but earlier-arriving) fix may have created
      -- before the true next 'exit_pickup' after this point.
      DELETE FROM public.geofence_events
      WHERE trip_id = p_trip_id AND event_type = 'enter_pickup'
        AND recorded_at > p_recorded_at
        AND recorded_at < COALESCE(
          (SELECT MIN(recorded_at) FROM public.geofence_events
           WHERE trip_id = p_trip_id AND event_type = 'exit_pickup' AND recorded_at > p_recorded_at),
          'infinity'::timestamptz
        );
    ELSIF v_was_inside AND v_dist_m >= v_exit_radius THEN
      INSERT INTO public.geofence_events
        (trip_id, driver_id, organization_id, event_type, latitude, longitude, recorded_at)
      VALUES
        (p_trip_id, p_driver_id, p_org_id, 'exit_pickup', p_latitude, p_longitude, p_recorded_at);
      DELETE FROM public.geofence_events
      WHERE trip_id = p_trip_id AND event_type = 'exit_pickup'
        AND recorded_at > p_recorded_at
        AND recorded_at < COALESCE(
          (SELECT MIN(recorded_at) FROM public.geofence_events
           WHERE trip_id = p_trip_id AND event_type = 'enter_pickup' AND recorded_at > p_recorded_at),
          'infinity'::timestamptz
        );
    END IF;
  END IF;

  -- ── Drop side ────────────────────────────────────────────────────────────
  IF v_drop_lat IS NOT NULL AND v_drop_lon IS NOT NULL THEN
    v_dist_m := (
      6371000 * 2 * asin(sqrt(
        power(sin(radians(p_latitude - v_drop_lat) / 2), 2) +
        cos(radians(v_drop_lat)) * cos(radians(p_latitude)) *
        power(sin(radians(p_longitude - v_drop_lon) / 2), 2)
      ))
    );

    SELECT event_type INTO v_last_event
    FROM public.geofence_events
    WHERE trip_id = p_trip_id AND event_type IN ('enter_drop', 'exit_drop')
      AND recorded_at < p_recorded_at
    ORDER BY recorded_at DESC
    LIMIT 1;

    v_was_inside := COALESCE(v_last_event = 'enter_drop', false);

    IF NOT v_was_inside AND v_dist_m <= v_enter_radius THEN
      INSERT INTO public.geofence_events
        (trip_id, driver_id, organization_id, event_type, latitude, longitude, recorded_at)
      VALUES
        (p_trip_id, p_driver_id, p_org_id, 'enter_drop', p_latitude, p_longitude, p_recorded_at);
      DELETE FROM public.geofence_events
      WHERE trip_id = p_trip_id AND event_type = 'enter_drop'
        AND recorded_at > p_recorded_at
        AND recorded_at < COALESCE(
          (SELECT MIN(recorded_at) FROM public.geofence_events
           WHERE trip_id = p_trip_id AND event_type = 'exit_drop' AND recorded_at > p_recorded_at),
          'infinity'::timestamptz
        );
    ELSIF v_was_inside AND v_dist_m >= v_exit_radius THEN
      INSERT INTO public.geofence_events
        (trip_id, driver_id, organization_id, event_type, latitude, longitude, recorded_at)
      VALUES
        (p_trip_id, p_driver_id, p_org_id, 'exit_drop', p_latitude, p_longitude, p_recorded_at);
      DELETE FROM public.geofence_events
      WHERE trip_id = p_trip_id AND event_type = 'exit_drop'
        AND recorded_at > p_recorded_at
        AND recorded_at < COALESCE(
          (SELECT MIN(recorded_at) FROM public.geofence_events
           WHERE trip_id = p_trip_id AND event_type = 'enter_drop' AND recorded_at > p_recorded_at),
          'infinity'::timestamptz
        );
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.tracking_detect_geofence_transition IS
  'Emits enter_pickup/exit_pickup/enter_drop/exit_drop into geofence_events on a genuine inside/outside state flip (asymmetric hysteresis: enter <=300m, exit >=450m). Current state is read from the last geofence_events row per trip+side with recorded_at < the fix being processed (not a separate column, and not simply "globally latest" -- see out-of-order handling above). Each insert is followed by a cleanup delete collapsing now-stale same-type duplicates left behind by a late-arriving fix. Called from tracking_record_checkpoint on every GPS fix, not only ones that pass the movement gate.';

-- ── Wire into the existing checkpoint RPC ───────────────────────────────────
-- Same body as 20260802130000_tracking_realtime_subsystem.sql's
-- tracking_record_checkpoint, with one addition: a call to
-- tracking_detect_geofence_transition() before each RETURN, so both the
-- sparse "presence only" path and the full checkpoint-write path are covered.

CREATE OR REPLACE FUNCTION public.tracking_record_checkpoint(
  p_trip_id         uuid,
  p_driver_id       uuid,
  p_org_id          uuid,
  p_session_id      uuid,
  p_latitude        double precision,
  p_longitude       double precision,
  p_accuracy        double precision DEFAULT NULL,
  p_heading         double precision DEFAULT NULL,
  p_speed_kmh       double precision DEFAULT NULL,
  p_source          text DEFAULT 'live',
  p_recorded_at     timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             uuid;
  v_last_lat        double precision;
  v_last_lon        double precision;
  v_last_at         timestamptz;
  v_dist_m          double precision;
  v_elapsed         interval;
  v_checkpoint_id   uuid;
  v_wrote           boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = p_driver_id AND d.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'driver mismatch';
  END IF;

  SELECT latitude, longitude, recorded_at
  INTO   v_last_lat, v_last_lon, v_last_at
  FROM   public.driver_presence
  WHERE  driver_id = p_driver_id;

  IF v_last_at IS NOT NULL THEN
    v_elapsed := p_recorded_at - v_last_at;
    v_dist_m := (
      6371000 * 2 * asin(sqrt(
        power(sin(radians(p_latitude - v_last_lat) / 2), 2) +
        cos(radians(v_last_lat)) * cos(radians(p_latitude)) *
        power(sin(radians(p_longitude - v_last_lon) / 2), 2)
      ))
    );
    IF v_dist_m < 50 AND v_elapsed < interval '30 seconds' THEN
      INSERT INTO public.driver_presence (
        driver_id, organization_id, trip_id, session_id,
        latitude, longitude, accuracy, heading, speed_kmh, recorded_at, updated_at
      ) VALUES (
        p_driver_id, p_org_id, p_trip_id, p_session_id,
        p_latitude, p_longitude, p_accuracy, p_heading, p_speed_kmh, p_recorded_at, now()
      )
      ON CONFLICT (driver_id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        trip_id         = EXCLUDED.trip_id,
        session_id      = EXCLUDED.session_id,
        latitude        = EXCLUDED.latitude,
        longitude       = EXCLUDED.longitude,
        accuracy        = EXCLUDED.accuracy,
        heading         = EXCLUDED.heading,
        speed_kmh       = EXCLUDED.speed_kmh,
        recorded_at     = EXCLUDED.recorded_at,
        updated_at      = now();

      IF p_trip_id IS NOT NULL THEN
        PERFORM public.tracking_detect_geofence_transition(
          p_trip_id, p_driver_id, p_org_id, p_latitude, p_longitude, p_recorded_at
        );
      END IF;

      RETURN jsonb_build_object('wrote', false, 'checkpoint_id', null, 'dist_m', v_dist_m);
    END IF;
  END IF;

  v_checkpoint_id := gen_random_uuid();
  INSERT INTO public.trip_location_checkpoints (
    id, trip_id, driver_id, organization_id, session_id,
    latitude, longitude, accuracy, heading, speed_kmh, distance_delta_m, source, recorded_at
  ) VALUES (
    v_checkpoint_id, p_trip_id, p_driver_id, p_org_id, p_session_id,
    p_latitude, p_longitude, p_accuracy, p_heading, p_speed_kmh,
    CASE WHEN v_last_at IS NOT NULL THEN v_dist_m ELSE NULL END,
    coalesce(p_source, 'live'), p_recorded_at
  );
  v_wrote := true;

  INSERT INTO public.driver_presence (
    driver_id, organization_id, trip_id, session_id,
    latitude, longitude, accuracy, heading, speed_kmh, recorded_at, updated_at
  ) VALUES (
    p_driver_id, p_org_id, p_trip_id, p_session_id,
    p_latitude, p_longitude, p_accuracy, p_heading, p_speed_kmh, p_recorded_at, now()
  )
  ON CONFLICT (driver_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    trip_id         = EXCLUDED.trip_id,
    session_id      = EXCLUDED.session_id,
    latitude        = EXCLUDED.latitude,
    longitude       = EXCLUDED.longitude,
    accuracy        = EXCLUDED.accuracy,
    heading         = EXCLUDED.heading,
    speed_kmh       = EXCLUDED.speed_kmh,
    recorded_at     = EXCLUDED.recorded_at,
    updated_at      = now();

  UPDATE public.trips
  SET last_location_at = p_recorded_at
  WHERE id = p_trip_id;

  IF p_trip_id IS NOT NULL THEN
    PERFORM public.tracking_detect_geofence_transition(
      p_trip_id, p_driver_id, p_org_id, p_latitude, p_longitude, p_recorded_at
    );
  END IF;

  RETURN jsonb_build_object('wrote', v_wrote, 'checkpoint_id', v_checkpoint_id, 'dist_m', v_dist_m);
END;
$$;

COMMENT ON FUNCTION public.tracking_record_checkpoint IS
  'Sparse GPS checkpoint + driver_presence UPSERT. Movement gate: 50m OR 30s since last presence. Returns wrote=true when checkpoint row was inserted. Also runs geofence transition detection (see tracking_detect_geofence_transition) on every fix, gate or no gate.';

GRANT EXECUTE ON FUNCTION public.tracking_detect_geofence_transition TO authenticated;
