-- Vehicle documents storage: create bucket and add RLS policies.
-- Bucket: vehicle-documents (private). Path: {orgId}/{vehicleId}/{docType}.{ext}
-- Org members can upload, read, update, and delete documents for their org's vehicles.
-- Metadata is stored in vehicles.documents JSONB column (no separate table needed).

-- 1. Create the private bucket (idempotent).
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-documents', 'vehicle-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Org members can upload vehicle documents (INSERT into storage.objects).
-- Path: {orgId}/{vehicleId}/{docType}.{ext} — first folder = orgId, must match membership.
DROP POLICY IF EXISTS "Org members can upload vehicle documents" ON storage.objects;

CREATE POLICY "Org members can upload vehicle documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
  )
);

-- 3. Org members can read/view vehicle documents (SELECT).
DROP POLICY IF EXISTS "Org members can read vehicle documents" ON storage.objects;

CREATE POLICY "Org members can read vehicle documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vehicle-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
  )
);

-- 4. Org members can update/overwrite vehicle documents (UPDATE — used by upsert: true).
DROP POLICY IF EXISTS "Org members can update vehicle documents" ON storage.objects;

CREATE POLICY "Org members can update vehicle documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vehicle-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'vehicle-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
  )
);

-- 5. Org members can delete vehicle documents (DELETE).
DROP POLICY IF EXISTS "Org members can delete vehicle documents" ON storage.objects;

CREATE POLICY "Org members can delete vehicle documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vehicle-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
  )
);
