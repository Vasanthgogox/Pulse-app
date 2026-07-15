-- Allow drivers to read their own location rows (needed for dev pin-trail feature).
DROP POLICY IF EXISTS "Drivers read own locations" ON public.driver_locations;

CREATE POLICY "Drivers read own locations"
  ON public.driver_locations
  FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM public.drivers WHERE user_id = auth.uid()
    )
  );
