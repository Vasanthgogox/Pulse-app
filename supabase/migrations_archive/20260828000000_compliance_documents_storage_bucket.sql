-- ============================================================================
-- Compliance Documents — private storage bucket + access policies.
--
-- Bucket: `compliance-documents` (private).
-- Path  : {orgId}/{entityType}/{entityId}/{docType}_{uuid}.{ext}
--   - First folder = orgId (enforced by storage.foldername(name)[1] checks).
--   - Second folder = entityType (vehicle | driver | supplier | organization).
--   - Third  folder = entityId.
--   - Filename includes uuid for replace-history (old file kept for audit).
--
-- Policies follow the pattern established in
--   `20260321120000_vehicle_documents_storage_policies.sql`
--   (org members → CRUD on their org's documents) but use the
--   security-hardened `public.is_org_member(uuid)` helper instead of
--   inlining the membership lookup, so RLS evaluation is consistent
--   with the rest of the schema and immune to future renames of
--   `organization_members`.
-- ============================================================================

-- 1. Private bucket (idempotent).
INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-documents', 'compliance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Org members may upload (INSERT).
DROP POLICY IF EXISTS "Org members can upload compliance documents" ON storage.objects;
CREATE POLICY "Org members can upload compliance documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'compliance-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

-- 3. Org members may read / signed-url their org's documents (SELECT).
DROP POLICY IF EXISTS "Org members can read compliance documents" ON storage.objects;
CREATE POLICY "Org members can read compliance documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'compliance-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

-- 4. Org members may overwrite (UPDATE — used by upsert-style replaces).
DROP POLICY IF EXISTS "Org members can update compliance documents" ON storage.objects;
CREATE POLICY "Org members can update compliance documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'compliance-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'compliance-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

-- 5. Org members may delete (DELETE).
DROP POLICY IF EXISTS "Org members can delete compliance documents" ON storage.objects;
CREATE POLICY "Org members can delete compliance documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'compliance-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);
