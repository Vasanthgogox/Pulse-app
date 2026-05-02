-- trip_assignment_audit: driver dashboard / tabs query this via PostgREST.
-- If the table was never created (SQL only under migrations/), GET returns 404 and TanStack Query can throw.
-- This migration creates the table and RLS: org members + assigned drivers can read; org members can insert.

CREATE TABLE IF NOT EXISTS public.trip_assignment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  driver_id_prev uuid REFERENCES public.drivers (id) ON DELETE SET NULL,
  driver_id_new uuid REFERENCES public.drivers (id) ON DELETE SET NULL,
  vehicle_id_prev uuid REFERENCES public.vehicles (id) ON DELETE SET NULL,
  vehicle_id_new uuid REFERENCES public.vehicles (id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT trip_assignment_audit_event_type_check CHECK (
    event_type = ANY (ARRAY['assignment'::text, 'reassignment'::text, 'completed'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_trip_id ON public.trip_assignment_audit USING btree (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_assignment_audit_changed_at ON public.trip_assignment_audit USING btree (trip_id, changed_at DESC);

ALTER TABLE public.trip_assignment_audit ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_assignment_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_assignment_audit TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_assignment_audit'
      AND policyname = 'Org members can read trip assignment audit'
  ) THEN
    CREATE POLICY "Org members can read trip assignment audit"
      ON public.trip_assignment_audit
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.trips t
          INNER JOIN public.organization_members om
            ON om.organization_id = t.organization_id
            AND om.user_id = auth.uid()
            AND COALESCE(om.status, 'active') = 'active'
          WHERE t.id = trip_assignment_audit.trip_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_assignment_audit'
      AND policyname = 'Drivers can read trip assignment audit for assigned trips'
  ) THEN
    CREATE POLICY "Drivers can read trip assignment audit for assigned trips"
      ON public.trip_assignment_audit
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.trips t
          INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = auth.uid()
          WHERE t.id = trip_assignment_audit.trip_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_assignment_audit'
      AND policyname = 'Org members can insert trip assignment audit'
  ) THEN
    CREATE POLICY "Org members can insert trip assignment audit"
      ON public.trip_assignment_audit
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.trips t
          INNER JOIN public.organization_members om
            ON om.organization_id = t.organization_id
            AND om.user_id = auth.uid()
            AND COALESCE(om.status, 'active') = 'active'
          WHERE t.id = trip_assignment_audit.trip_id
        )
      );
  END IF;
END;
$$;

COMMENT ON TABLE public.trip_assignment_audit IS 'Per-trip audit: assignment, reassignment, completion; Private vs Shared UI and activity log.';
