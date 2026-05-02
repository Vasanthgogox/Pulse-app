-- POD delete from driver app: storage.objects DELETE previously required auth.uid() = owner.
-- Some uploads leave owner unset or not equal to the uploader; assigned drivers could not remove files.
-- Allow DELETE for objects under trip-documents/{trip_id}/ when the user is the trip's assigned driver
-- or an active member of the trip's owning organization (fleet cleanup).

CREATE POLICY "Trip access can delete trip-documents objects in trip folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'trip-documents'
    AND (
      EXISTS (
        SELECT 1
        FROM public.trips t
        INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = auth.uid()
        WHERE t.id::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1
        FROM public.trips t
        INNER JOIN public.organization_members om
          ON om.organization_id = t.organization_id
          AND om.user_id = auth.uid()
          AND COALESCE(om.status, 'active') = 'active'
        WHERE t.id::text = (storage.foldername(name))[1]
      )
    )
  );

COMMENT ON POLICY "Trip access can delete trip-documents objects in trip folder" ON storage.objects IS
  'Driver POD remove: delete files under a trip folder when user is assigned driver or org member; supplements owner-based delete policy.';
