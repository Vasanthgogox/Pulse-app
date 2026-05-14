-- Trip documents (POD): allow suppliers to read metadata and storage files.
-- Required so Driver POD preview shows uploaded image for dispatcher/supplier.
-- See docs/TRIP_DOCUMENTS_RLS_AND_STORAGE.md.
--
-- This migration sorts before 20260516180300 / 20260520120100; fresh `db reset --linked`
-- must have public.trip_documents before DROP POLICY / CREATE POLICY below.
CREATE TABLE IF NOT EXISTS public.trip_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT trip_documents_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_trip_documents_trip_id ON public.trip_documents USING btree (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_documents_trip_uploaded ON public.trip_documents USING btree (trip_id, uploaded_at DESC);

ALTER TABLE public.trip_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_documents TO service_role;

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
