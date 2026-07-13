-- 009_trip_documents_pod_update.sql

-- For the specific RLS violation when supplier logs POD and uploads evidence,
-- we need to ensure the user has access to upload to the "trip-documents" bucket and
-- insert into "trip_documents" table when they are the supplier.

-- The current policy requires the user to be in the organization of the trip (the client's org).
-- But if the user is logging a POD, they are typically the supplier.

-- Let's add policies to allow the supplier to manage trip documents and files.

CREATE POLICY "Supplier can manage trip documents"
  ON public.trip_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.organization_members om ON om.organization_id = t.supplier_id AND om.user_id = auth.uid()
      WHERE t.id = trip_documents.trip_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.organization_members om ON om.organization_id = t.supplier_id AND om.user_id = auth.uid()
      WHERE t.id = trip_documents.trip_id
    )
  );

CREATE POLICY "Supplier can manage trip document files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'trip-documents'
    AND EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.organization_members om ON om.organization_id = t.supplier_id AND om.user_id = auth.uid()
      WHERE t.id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'trip-documents'
    AND EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.organization_members om ON om.organization_id = t.supplier_id AND om.user_id = auth.uid()
      WHERE t.id::text = (storage.foldername(name))[1]
    )
  );
