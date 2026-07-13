-- Drop the overly restrictive ALL policy
DROP POLICY IF EXISTS "Supplier can manage trip document files" ON storage.objects;

-- Allow authenticated users to upload files to trip-documents bucket
CREATE POLICY "Allow authenticated uploads to trip-documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'trip-documents'
  );

-- Allow authenticated users to view files in trip-documents bucket (in case they couldn't before)
CREATE POLICY "Allow authenticated reads to trip-documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'trip-documents'
  );

-- Allow authenticated users to update/delete their own files in trip-documents
CREATE POLICY "Allow authenticated users to update their files in trip-documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'trip-documents' AND auth.uid() = owner
  )
  WITH CHECK (
    bucket_id = 'trip-documents' AND auth.uid() = owner
  );

CREATE POLICY "Allow authenticated users to delete their files in trip-documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'trip-documents' AND auth.uid() = owner
  );

-- Also simplify the trip_documents table policy for inserts
DROP POLICY IF EXISTS "Supplier can manage trip documents" ON public.trip_documents;

CREATE POLICY "Authenticated users can insert trip documents for their trips"
  ON public.trip_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_documents.trip_id
      -- If the user can see the trip, they can upload a document for it.
      -- The trips table already has RLS restricting visibility.
    )
  );

CREATE POLICY "Authenticated users can manage trip documents for their trips"
  ON public.trip_documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_documents.trip_id
    )
  );

CREATE POLICY "Authenticated users can delete trip documents for their trips"
  ON public.trip_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_documents.trip_id
    )
  );
