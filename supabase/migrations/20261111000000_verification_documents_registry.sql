-- =============================================================================
-- Verification Documents Registry + Storage Bucket Hardening
-- =============================================================================
-- (See STEP 6 below for an unrelated fix folded in: submit_business_verification's
-- INSERT INTO verification_jobs CASE expression for pillar_2_mca_status resolved
-- to `text` instead of `pillar_status_type`, causing every submission to fail
-- with 42804 "column is of type pillar_status_type but expression is of type
-- text". Pre-existing bug from 20261101000005, unrelated to documents — fixed
-- here since this migration already replaces submit_business_verification.)
-- =============================================================================
-- Problem: `organizations.address_proof_path` is a single column holding one
-- document path, with no upload audit trail, no per-document review status,
-- and no way to require more than one document type. The OCR worker
-- (ocr-doc-verify) also has nothing but the address proof to check the typed
-- GSTIN/PAN against, so its "congruence" check is checking the wrong document.
--
-- Fix: a document registry table (one row per uploaded file, keeps re-upload
-- history), a properly hardened `verification-documents` bucket (this bucket
-- was referenced in code since sprint 1 but never created by a migration —
-- every select against it has been relying on a bucket someone made by hand
-- in the dashboard, or failing silently), and GST-certificate / PAN-card
-- document types so OCR can check the right file for each credential.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: document_type_enum
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.verification_document_type AS ENUM (
    'gst_certificate',   -- Step 2: GST registration certificate (checked against typed GSTIN)
    'pan_card',          -- Step 2: PAN card copy (checked against typed PAN)
    'address_proof_lease',
    'address_proof_utility_bill',
    'address_proof_other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_document_status AS ENUM (
    'UPLOADED',       -- awaiting OCR pass
    'OCR_PASSED',
    'OCR_FAILED',
    'MANUAL_REVIEW',
    'REPLACED'        -- superseded by a newer upload of the same doc_type
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: verification_documents — one row per uploaded file
-- Re-uploads insert a new row and mark the previous one REPLACED, preserving
-- history for admin review instead of overwriting a single path column.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.verification_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_type   public.verification_document_type NOT NULL,
  storage_path    text        NOT NULL,   -- '{orgId}/{documentType}/{uuid}.{ext}' in verification-documents bucket
  mime_type       text        NOT NULL,
  size_bytes      bigint      NOT NULL,
  status          public.verification_document_status NOT NULL DEFAULT 'UPLOADED',
  ocr_detail      jsonb,
  uploaded_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_verification_doc_size CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  CONSTRAINT chk_verification_doc_mime CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')
  )
);

-- Only one active (non-REPLACED) document per org per document_type.
CREATE UNIQUE INDEX IF NOT EXISTS uq_verification_doc_active
  ON public.verification_documents (org_id, document_type)
  WHERE status <> 'REPLACED';

CREATE INDEX IF NOT EXISTS idx_verification_docs_org
  ON public.verification_documents (org_id, document_type, created_at DESC);

ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read own verification documents" ON public.verification_documents;
CREATE POLICY "Org members read own verification documents"
  ON public.verification_documents FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Org owners/admins insert verification documents" ON public.verification_documents;
CREATE POLICY "Org owners/admins insert verification documents"
  ON public.verification_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = org_id
        AND user_id = (SELECT auth.uid())
        AND status = 'active'
        AND role IN ('owner', 'admin')
    )
  );

CREATE TRIGGER trg_verification_documents_updated_at
  BEFORE UPDATE ON public.verification_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: verification-documents bucket — private, size/mime hardened
-- Referenced by client + edge function code since sprint 1 but never created
-- by a migration. Idempotent upsert matches the pattern used for
-- vehicle-documents / compliance-documents.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents',
  'verification-documents',
  false,
  10485760,   -- 10 MB, matches the UI's stated limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path convention: {orgId}/{documentType}/{uuid}.{ext} — first folder segment
-- is the org id, matching the compliance-documents / vehicle-documents pattern
-- so is_org_member() can gate access via storage.foldername(name)[1].

DROP POLICY IF EXISTS "Org members can upload verification documents" ON storage.objects;
CREATE POLICY "Org members can upload verification documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verification-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Org members can read verification documents" ON storage.objects;
CREATE POLICY "Org members can read verification documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Org members can replace verification documents" ON storage.objects;
CREATE POLICY "Org members can replace verification documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'verification-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Org members can delete verification documents" ON storage.objects;
CREATE POLICY "Org members can delete verification documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: register_verification_document RPC
-- Called by the mobile client after a successful storage upload. Runs as
-- SECURITY DEFINER so it can atomically mark the prior active document of the
-- same type as REPLACED and insert the new one — avoids a client-side
-- read-then-write race between two devices uploading the same doc_type.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_verification_document(
  p_org_id        uuid,
  p_document_type public.verification_document_type,
  p_storage_path  text,
  p_mime_type     text,
  p_size_bytes    bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      text;
  v_status    public.kyc_verification_status;
  v_doc_id    uuid;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can upload verification documents.';
  END IF;

  SELECT verification_status INTO v_status
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_status IN ('pending', 'verified') THEN
    RAISE EXCEPTION 'PROFILE_FROZEN: Documents are locked while status is %.', v_status;
  END IF;

  IF p_size_bytes <= 0 OR p_size_bytes > 10485760 THEN
    RAISE EXCEPTION 'File size must be between 1 byte and 10 MB.';
  END IF;

  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf') THEN
    RAISE EXCEPTION 'Unsupported file type: %. Allowed: JPG, PNG, WEBP, HEIC, PDF.', p_mime_type;
  END IF;

  UPDATE public.verification_documents
  SET status = 'REPLACED', updated_at = now()
  WHERE org_id = p_org_id
    AND document_type = p_document_type
    AND status <> 'REPLACED';

  INSERT INTO public.verification_documents
    (org_id, document_type, storage_path, mime_type, size_bytes, uploaded_by)
  VALUES
    (p_org_id, p_document_type, p_storage_path, p_mime_type, p_size_bytes, auth.uid())
  RETURNING id INTO v_doc_id;

  RETURN jsonb_build_object('ok', true, 'document_id', v_doc_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_verification_document(
  uuid, public.verification_document_type, text, text, bigint
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: get_verification_documents RPC — list active documents for an org
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_verification_documents(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',            d.id,
    'document_type', d.document_type,
    'storage_path',  d.storage_path,
    'mime_type',     d.mime_type,
    'size_bytes',    d.size_bytes,
    'status',        d.status,
    'created_at',    d.created_at
  ) ORDER BY d.created_at DESC), '[]'::jsonb)
  FROM public.verification_documents d
  JOIN public.organization_members om
    ON om.organization_id = d.org_id
   AND om.user_id = auth.uid()
   AND om.status  = 'active'
  WHERE d.org_id = p_org_id
    AND d.status <> 'REPLACED';
$$;

GRANT EXECUTE ON FUNCTION public.get_verification_documents(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: submit_business_verification — require GST cert + PAN card too
-- Replaces the version from 20261101000005. Adds a document-completeness
-- gate alongside the existing PAN/GSTIN text-field gate.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_business_verification(
  p_org_id             uuid,
  p_registration_type  public.registration_type_enum DEFAULT NULL,
  p_address_pincode    text    DEFAULT NULL,
  p_address_proof_path text    DEFAULT NULL,
  p_address_proof_type text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role            text;
  v_current_status  public.kyc_verification_status;
  v_reg_type        public.registration_type_enum;
  v_has_gst_cert    boolean;
  v_has_pan_card    boolean;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can submit for verification.';
  END IF;

  SELECT verification_status, registration_type
  INTO v_current_status, v_reg_type
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status NOT IN ('unverified', 'rejected') THEN
    RAISE EXCEPTION 'Profile is already % and cannot be resubmitted.', v_current_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND business_pan IS NOT NULL AND gstin IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAN and GSTIN must be saved before submitting.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.verification_documents
    WHERE org_id = p_org_id AND document_type = 'gst_certificate' AND status <> 'REPLACED'
  ) INTO v_has_gst_cert;

  SELECT EXISTS (
    SELECT 1 FROM public.verification_documents
    WHERE org_id = p_org_id AND document_type = 'pan_card' AND status <> 'REPLACED'
  ) INTO v_has_pan_card;

  IF NOT v_has_gst_cert THEN
    RAISE EXCEPTION 'GST registration certificate must be uploaded before submitting.';
  END IF;

  IF NOT v_has_pan_card THEN
    RAISE EXCEPTION 'PAN card copy must be uploaded before submitting.';
  END IF;

  IF p_address_proof_path IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND address_proof_path IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Address proof must be uploaded before submitting.';
  END IF;

  UPDATE public.organizations SET
    registration_type   = COALESCE(p_registration_type,  registration_type),
    address_pincode     = COALESCE(NULLIF(TRIM(p_address_pincode), ''),   address_pincode),
    address_proof_path  = COALESCE(NULLIF(TRIM(p_address_proof_path), ''), address_proof_path),
    address_proof_type  = COALESCE(NULLIF(TRIM(p_address_proof_type), ''), address_proof_type),
    verification_status = 'pending',
    frozen_at           = now(),
    submitted_at        = now(),
    rejection_reasons   = NULL,
    updated_at          = now()
  WHERE id = p_org_id;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, auth.uid(), v_current_status, 'pending', 'user_submitted');

  v_reg_type := COALESCE(p_registration_type, v_reg_type);

  INSERT INTO public.verification_jobs (organization_id, status, pillar_2_mca_status)
  VALUES (
    p_org_id,
    'QUEUED'::public.verification_job_status,
    CASE WHEN v_reg_type IN ('llp', 'pvt_ltd', 'public_ltd', 'partnership')
         THEN 'QUEUED' ELSE 'NOT_STARTED' END::public.pillar_status_type
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    status              = 'QUEUED',
    ocr_status          = 'QUEUED',
    pillar_1_tax_status = 'QUEUED',
    pillar_2_mca_status = EXCLUDED.pillar_2_mca_status,
    ocr_detail          = NULL,
    pillar_1_tax_detail = NULL,
    pillar_2_mca_detail = NULL,
    attempts            = 0,
    error_logs          = NULL,
    next_attempt_at     = now(),
    completed_at        = NULL,
    updated_at          = now();

  RETURN jsonb_build_object(
    'ok',                  true,
    'org_id',              p_org_id,
    'verification_status', 'pending',
    'frozen_at',           now(),
    'job_queued',          true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_business_verification(
  uuid, public.registration_type_enum, text, text, text
) TO authenticated;
