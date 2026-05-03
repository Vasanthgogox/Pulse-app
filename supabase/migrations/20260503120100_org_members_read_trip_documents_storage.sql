-- Fleet/dispatcher users are organization_members on the trip's organization but were not always
-- covered by supplier-only storage policies. Allow SELECT on trip-documents objects when the
-- object path prefix matches a trip id the user can access via organization_members.

DROP POLICY IF EXISTS "Org members can read trip documents by folder" ON storage.objects;

CREATE POLICY "Org members can read trip documents by folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-documents'
  AND EXISTS (
    SELECT 1
    FROM public.trips t
    INNER JOIN public.organization_members om
      ON om.organization_id = t.organization_id
      AND om.user_id = auth.uid()
      AND COALESCE(om.status, 'active') = 'active'
    WHERE t.id::text = (storage.foldername(name))[1]
  )
);
