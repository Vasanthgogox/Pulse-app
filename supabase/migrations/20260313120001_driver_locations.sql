-- Driver location history for live trip tracking and tap-to-report.
-- Used by q-mobile driver app: periodic (every 10s dev / 30s prod) when on trip, and on-demand tap.

CREATE TABLE IF NOT EXISTS public.driver_locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  trip_id         uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  latitude        double precision NOT NULL,
  longitude       double precision NOT NULL,
  accuracy        double precision NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'tap', 'background'))
);

CREATE INDEX idx_driver_locations_driver_recorded ON public.driver_locations(driver_id, recorded_at DESC);
CREATE INDEX idx_driver_locations_trip_recorded ON public.driver_locations(trip_id, recorded_at DESC) WHERE trip_id IS NOT NULL;
CREATE INDEX idx_driver_locations_org_recorded ON public.driver_locations(organization_id, recorded_at DESC);

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Driver can insert only their own location (driver row where user_id = auth.uid()).
CREATE POLICY "Drivers insert own location"
  ON public.driver_locations FOR INSERT
  WITH CHECK (
    driver_id IN (
      SELECT id FROM public.drivers WHERE user_id = auth.uid()
    )
  );

-- Org members (dispatcher/fleet) can read locations for drivers in their org.
CREATE POLICY "Org members read org driver locations"
  ON public.driver_locations FOR SELECT
  USING (
    public.is_org_member(organization_id)
  );

COMMENT ON TABLE public.driver_locations IS 'Driver GPS history: periodic during trip (live) and tap-to-report (tap).';
