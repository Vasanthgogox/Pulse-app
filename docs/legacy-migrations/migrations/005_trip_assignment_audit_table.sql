-- Create trip_assignment_audit so "Driver declined" and assignment history show in dispatcher Activity Log.
-- Run in Supabase Dashboard → SQL Editor. Safe to run if table already exists (IF NOT EXISTS).
-- Requires: public.trips, public.drivers, public.vehicles, public.profiles (or omit changed_by FK if missing).

CREATE TABLE IF NOT EXISTS public.trip_assignment_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  trip_id uuid NOT NULL,
  event_type text NOT NULL,
  driver_id_prev uuid,
  driver_id_new uuid,
  vehicle_id_prev uuid,
  vehicle_id_new uuid,
  changed_at timestamptz DEFAULT now() NOT NULL,
  changed_by uuid,
  CONSTRAINT trip_assignment_audit_event_type_check CHECK (
    event_type = ANY (ARRAY['assignment'::text, 'reassignment'::text, 'completed'::text])
  )
);

ALTER TABLE public.trip_assignment_audit OWNER TO postgres;
COMMENT ON TABLE public.trip_assignment_audit IS 'Per-trip audit: assignment, reassignment, completion; used for Activity Log and "Driver declined".';

-- Primary key and FKs (ignore if already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_assignment_audit_pkey'
  ) THEN
    ALTER TABLE public.trip_assignment_audit ADD CONSTRAINT trip_assignment_audit_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_assignment_audit_trip_id_fkey') THEN
    ALTER TABLE public.trip_assignment_audit
      ADD CONSTRAINT trip_assignment_audit_trip_id_fkey
      FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_assignment_audit_driver_id_prev_fkey') THEN
    ALTER TABLE public.trip_assignment_audit
      ADD CONSTRAINT trip_assignment_audit_driver_id_prev_fkey
      FOREIGN KEY (driver_id_prev) REFERENCES public.drivers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_assignment_audit_driver_id_new_fkey') THEN
    ALTER TABLE public.trip_assignment_audit
      ADD CONSTRAINT trip_assignment_audit_driver_id_new_fkey
      FOREIGN KEY (driver_id_new) REFERENCES public.drivers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_assignment_audit_vehicle_id_prev_fkey') THEN
    ALTER TABLE public.trip_assignment_audit
      ADD CONSTRAINT trip_assignment_audit_vehicle_id_prev_fkey
      FOREIGN KEY (vehicle_id_prev) REFERENCES public.vehicles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_assignment_audit_vehicle_id_new_fkey') THEN
    ALTER TABLE public.trip_assignment_audit
      ADD CONSTRAINT trip_assignment_audit_vehicle_id_new_fkey
      FOREIGN KEY (vehicle_id_new) REFERENCES public.vehicles(id) ON DELETE SET NULL;
  END IF;
  -- changed_by: only add if profiles exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_assignment_audit_changed_by_fkey') THEN
    ALTER TABLE public.trip_assignment_audit
      ADD CONSTRAINT trip_assignment_audit_changed_by_fkey
      FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_trip_id ON public.trip_assignment_audit (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_changed_at ON public.trip_assignment_audit (trip_id, changed_at DESC);

ALTER TABLE public.trip_assignment_audit ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read/insert audit for trips in their org
DROP POLICY IF EXISTS "Org members can read trip assignment audit" ON public.trip_assignment_audit;
CREATE POLICY "Org members can read trip assignment audit" ON public.trip_assignment_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.organization_members om ON om.organization_id = t.organization_id AND om.user_id = auth.uid()
      WHERE t.id = trip_assignment_audit.trip_id
    )
  );

DROP POLICY IF EXISTS "Org members can insert trip assignment audit" ON public.trip_assignment_audit;
CREATE POLICY "Org members can insert trip assignment audit" ON public.trip_assignment_audit
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.organization_members om ON om.organization_id = t.organization_id AND om.user_id = auth.uid()
      WHERE t.id = trip_assignment_audit.trip_id
    )
  );

-- driver_reject_trip is SECURITY DEFINER so it can insert as definer; grant so authenticated can call
GRANT ALL ON TABLE public.trip_assignment_audit TO anon, authenticated, service_role;
