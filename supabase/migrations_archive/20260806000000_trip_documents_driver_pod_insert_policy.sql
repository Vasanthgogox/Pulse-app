-- Allow drivers to INSERT trip_documents for trips where they are the assigned driver.
-- The existing "trip_documents_org_member_manage" policy covers org members (dispatchers/admins)
-- but drivers are not org members, so they were blocked from uploading PODs.

DROP POLICY IF EXISTS "trip_documents_driver_insert" ON trip_documents;
CREATE POLICY "trip_documents_driver_insert" ON trip_documents
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_documents.trip_id
      AND t.driver_id IN (
        SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())
      )
  )
);

-- Also allow drivers to SELECT their own trip documents (e.g. to check upload status).
DROP POLICY IF EXISTS "trip_documents_driver_select" ON trip_documents;
CREATE POLICY "trip_documents_driver_select" ON trip_documents
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_documents.trip_id
      AND t.driver_id IN (
        SELECT id FROM public.drivers WHERE user_id = (SELECT auth.uid())
      )
  )
);
