-- Trip documents (POD): allow suppliers to read metadata and storage files.
-- Required so Driver POD preview shows uploaded image for dispatcher/supplier.
-- See docs/TRIP_DOCUMENTS_RLS_AND_STORAGE.md.

-- 1. Suppliers can read POD metadata from trip_documents
DROP POLICY IF EXISTS "Suppliers can view their trip documents" ON public.trip_documents;

CREATE POLICY "Suppliers can view their trip documents"
ON public.trip_documents
FOR SELECT
TO authenticated
USING (
  trip_id IN (
    SELECT id
    FROM public.trips
    WHERE supplier_id = auth.uid()
  )
);

-- 2. Suppliers can view/download POD files in trip-documents bucket
DROP POLICY IF EXISTS "Suppliers can view storage files" ON storage.objects;

CREATE POLICY "Suppliers can view storage files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text
    FROM public.trips
    WHERE supplier_id = auth.uid()
  )
);

-- 3. Suppliers can list objects in trip-documents (for storage fallback in getDocumentsByTripId)
DROP POLICY IF EXISTS "Suppliers can list storage folders" ON storage.objects;

CREATE POLICY "Suppliers can list storage folders"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-documents'
);
