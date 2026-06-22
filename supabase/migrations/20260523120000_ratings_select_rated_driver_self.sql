-- Driver app: let the logged-in driver read supplier/org ratings scored against them.
-- Existing policy covers org members via organization_id; drivers are usually not org members.

DROP POLICY IF EXISTS "ratings_select_when_rated_driver_is_self" ON public.ratings;
CREATE POLICY "ratings_select_when_rated_driver_is_self"
  ON public.ratings
  FOR SELECT
  TO authenticated
  USING (
    rated_type = 'driver'
    AND EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = ratings.rated_id
        AND d.user_id = auth.uid()
    )
  );
