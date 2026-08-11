-- Phase 2: Owner vehicle document vault (proper rows, not JSON metadata).
-- Business vehicle-documents bucket stays org-scoped and untouched.
-- See docs/DRIVER_FLEET_OWNER_PHASE1.md

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owner_vehicle_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_vehicle_id uuid NOT NULL
    REFERENCES public.owner_vehicles (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (
      document_type = ANY (
        ARRAY[
          'rc'::text,
          'insurance'::text,
          'fitness'::text,
          'permit'::text,
          'puc'::text,
          'tax'::text,
          'other'::text
        ]
      )
    ),
  document_number text,
  issued_at date,
  expires_at date,
  storage_path text NOT NULL,
  mime_type text,
  file_name text,
  file_size_bytes integer,
  -- Row lifecycle (replacement history). Expiry validity is derived from expires_at.
  status text NOT NULL DEFAULT 'current'
    CHECK (status = ANY (ARRAY['current'::text, 'replaced'::text, 'deleted'::text])),
  replaced_by uuid REFERENCES public.owner_vehicle_documents (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_vehicle_documents_owner_matches_vehicle CHECK (owner_user_id IS NOT NULL)
);

COMMENT ON TABLE public.owner_vehicle_documents IS
  'Fleet Owner personal vehicle documents. Owned via owner_user_id + owner_vehicle_id; not organization vehicles.';

COMMENT ON COLUMN public.owner_vehicle_documents.status IS
  'current = active version; replaced = superseded by replace; deleted = soft-removed.';

ALTER TABLE public.owner_vehicle_documents OWNER TO postgres;

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_vehicle_docs_one_current
  ON public.owner_vehicle_documents (owner_vehicle_id, document_type)
  WHERE status = 'current';

CREATE INDEX IF NOT EXISTS idx_owner_vehicle_docs_owner
  ON public.owner_vehicle_documents (owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_owner_vehicle_docs_vehicle
  ON public.owner_vehicle_documents (owner_vehicle_id)
  WHERE status = 'current';

CREATE INDEX IF NOT EXISTS idx_owner_vehicle_docs_expires
  ON public.owner_vehicle_documents (expires_at)
  WHERE status = 'current' AND expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS set_owner_vehicle_documents_updated_at
  ON public.owner_vehicle_documents;
CREATE TRIGGER set_owner_vehicle_documents_updated_at
  BEFORE UPDATE ON public.owner_vehicle_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Keep owner_user_id aligned with the parent vehicle (defense in depth).
CREATE OR REPLACE FUNCTION public.owner_vehicle_documents_enforce_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT ov.owner_user_id INTO v_owner
  FROM public.owner_vehicles ov
  WHERE ov.id = NEW.owner_vehicle_id
    AND ov.deleted_at IS NULL;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Owner vehicle not found';
  END IF;

  NEW.owner_user_id := v_owner;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_vehicle_documents_enforce_owner
  ON public.owner_vehicle_documents;
CREATE TRIGGER trg_owner_vehicle_documents_enforce_owner
  BEFORE INSERT OR UPDATE OF owner_vehicle_id
  ON public.owner_vehicle_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.owner_vehicle_documents_enforce_owner();

ALTER TABLE public.owner_vehicle_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet owners manage own vehicle documents"
  ON public.owner_vehicle_documents;
CREATE POLICY "Fleet owners manage own vehicle documents"
  ON public.owner_vehicle_documents
  FOR ALL
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.owner_vehicles ov
      WHERE ov.id = owner_vehicle_id
        AND ov.owner_user_id = (SELECT auth.uid())
        AND ov.deleted_at IS NULL
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_vehicle_documents TO authenticated;
GRANT ALL ON public.owner_vehicle_documents TO service_role;

-- ---------------------------------------------------------------------------
-- Storage: dedicated private bucket (NOT Business vehicle-documents)
-- Path: {owner_user_id}/{owner_vehicle_id}/{document_id}.{ext}
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'owner-vehicle-documents',
  'owner-vehicle-documents',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Owners upload own vehicle documents"
  ON storage.objects;
CREATE POLICY "Owners upload own vehicle documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'owner-vehicle-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND public.is_driver_fleet_owner((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Owners read own vehicle documents"
  ON storage.objects;
CREATE POLICY "Owners read own vehicle documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'owner-vehicle-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND public.is_driver_fleet_owner((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Owners update own vehicle documents"
  ON storage.objects;
CREATE POLICY "Owners update own vehicle documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'owner-vehicle-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND public.is_driver_fleet_owner((SELECT auth.uid()))
)
WITH CHECK (
  bucket_id = 'owner-vehicle-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND public.is_driver_fleet_owner((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Owners delete own vehicle documents"
  ON storage.objects;
CREATE POLICY "Owners delete own vehicle documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'owner-vehicle-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND public.is_driver_fleet_owner((SELECT auth.uid()))
);

-- Note: owner_vehicles.documents JSONB remains unused for Phase 2 operational data.
COMMENT ON COLUMN public.owner_vehicles.documents IS
  'Deprecated for Phase 2+ operational docs — use owner_vehicle_documents rows. Kept for compatibility.';
