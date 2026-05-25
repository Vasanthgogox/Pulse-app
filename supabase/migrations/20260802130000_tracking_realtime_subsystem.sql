-- Tracking realtime subsystem: presence UPSERT, sparse checkpoints, sessions, geofence.
-- Live movement uses Supabase Broadcast (client); this schema persists sparse state only.

-- ── 1. driver_presence (latest state per driver) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.driver_presence (
  driver_id         uuid PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id           uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  session_id        uuid,
  latitude          double precision NOT NULL,
  longitude         double precision NOT NULL,
  accuracy          double precision,
  heading           double precision,
  speed_kmh         double precision,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_presence_org_updated
  ON public.driver_presence (organization_id, updated_at DESC);

COMMENT ON TABLE public.driver_presence IS
  'Latest GPS state per driver (UPSERT). Not append-only; safe for fleet map reads.';

-- ── 2. trip_tracking_sessions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trip_tracking_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  driver_id         uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  device_id         text,
  last_heartbeat    timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  is_active         boolean NOT NULL DEFAULT true
);

-- One active session per driver (not per trip — driver can only track one trip at a time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_tracking_sessions_one_active
  ON public.trip_tracking_sessions (driver_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_trip_tracking_sessions_active
  ON public.trip_tracking_sessions (trip_id)
  WHERE is_active = true;

-- ── 3. trip_location_checkpoints (partitioned, sparse) ───────────────────────

CREATE TABLE IF NOT EXISTS public.trip_location_checkpoints (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  trip_id           uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  driver_id         uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES public.trip_tracking_sessions(id) ON DELETE SET NULL,
  latitude          double precision NOT NULL,
  longitude         double precision NOT NULL,
  accuracy          double precision,
  heading           double precision,
  speed_kmh         double precision,
  distance_delta_m  double precision,
  source            text NOT NULL DEFAULT 'live',
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

CREATE TABLE IF NOT EXISTS public.trip_location_checkpoints_default
  PARTITION OF public.trip_location_checkpoints DEFAULT;

CREATE INDEX IF NOT EXISTS idx_trip_location_checkpoints_trip_time
  ON public.trip_location_checkpoints (trip_id, recorded_at DESC);

-- ── 4. geofence_events ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.geofence_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  driver_id         uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type        text NOT NULL CHECK (event_type IN ('enter_pickup', 'exit_pickup', 'enter_drop', 'exit_drop', 'custom')),
  latitude          double precision NOT NULL,
  longitude         double precision NOT NULL,
  place_label       text,
  recorded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofence_events_trip
  ON public.geofence_events (trip_id, recorded_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.driver_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_location_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers upsert own presence" ON public.driver_presence;
CREATE POLICY "Drivers upsert own presence"
  ON public.driver_presence FOR ALL
  USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Org members read driver presence" ON public.driver_presence;
CREATE POLICY "Org members read driver presence"
  ON public.driver_presence FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Trip partners read checkpoints" ON public.trip_location_checkpoints;
CREATE POLICY "Trip partners read checkpoints"
  ON public.trip_location_checkpoints FOR SELECT
  USING (
    public.can_access_trip_location(trip_id)
  );

DROP POLICY IF EXISTS "Drivers insert checkpoints" ON public.trip_location_checkpoints;
CREATE POLICY "Drivers insert checkpoints"
  ON public.trip_location_checkpoints FOR INSERT
  WITH CHECK (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Drivers manage own sessions" ON public.trip_tracking_sessions;
CREATE POLICY "Drivers manage own sessions"
  ON public.trip_tracking_sessions FOR ALL
  USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()))
  WITH CHECK (driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Org read tracking sessions" ON public.trip_tracking_sessions;
CREATE POLICY "Org read tracking sessions"
  ON public.trip_tracking_sessions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org read geofence events" ON public.geofence_events;
CREATE POLICY "Org read geofence events"
  ON public.geofence_events FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Drivers insert geofence events" ON public.geofence_events;
CREATE POLICY "Drivers insert geofence events"
  ON public.geofence_events FOR INSERT
  WITH CHECK (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

-- ── RPC: sparse checkpoint + presence (movement gate 50m / 30s) ─────────────
--
-- Called by driver app on every GPS reading that passes the client-side movement filter.
-- Server re-applies the 50m / 30s gate so a misbehaving client can't flood the DB.
-- Returns wrote=true when a checkpoint row was inserted; false when only presence was updated.

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

  RETURN jsonb_build_object('wrote', v_wrote, 'checkpoint_id', v_checkpoint_id, 'dist_m', v_dist_m);
END;
$$;

COMMENT ON FUNCTION public.tracking_record_checkpoint IS
  'Sparse GPS checkpoint + driver_presence UPSERT. Movement gate: 50m OR 30s since last presence. Returns wrote=true when checkpoint row was inserted.';

GRANT EXECUTE ON FUNCTION public.tracking_record_checkpoint TO authenticated;
