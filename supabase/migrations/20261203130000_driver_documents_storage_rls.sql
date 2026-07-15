-- driver-documents bucket existed without storage.objects policies.
-- Authenticated uploads failed with: new row violates row-level security policy.
-- Paths are always "{auth.uid()}/{docType}-{timestamp}.{ext}".

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-documents',
  'driver-documents',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = COALESCE(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
  allowed_mime_types = COALESCE(storage.buckets.allowed_mime_types, EXCLUDED.allowed_mime_types);

DROP POLICY IF EXISTS "Drivers can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can update own documents" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "Org members can read linked driver documents" ON storage.objects;

CREATE POLICY "Drivers can upload own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Drivers can update own documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'driver-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'driver-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Drivers can read own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'driver-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Drivers can delete own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'driver-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Fleet operators with an active drivers roster row for that user can preview docs.
CREATE POLICY "Org members can read linked driver documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'driver-documents'
  AND EXISTS (
    SELECT 1
    FROM public.drivers d
    JOIN public.organization_members om
      ON om.organization_id = d.organization_id
     AND om.user_id = (SELECT auth.uid())
     AND om.status = 'active'
    WHERE d.user_id::text = (storage.foldername(name))[1]
      AND d.left_at IS NULL
  )
);
