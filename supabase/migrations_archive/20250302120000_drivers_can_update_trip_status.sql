-- Allow drivers to UPDATE trips assigned to them (status, started_at, completed_at).
-- Required so the driver app can change trip status (assigned → in_progress → completed).
DROP POLICY IF EXISTS "Drivers can update own trips" ON public.trips;
CREATE POLICY "Drivers can update own trips"
  ON public.trips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = trips.driver_id AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = trips.driver_id AND d.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Drivers can update own trips" ON public.trips IS 'Driver app: update status, started_at, completed_at for trips where driver_id is current user.';
