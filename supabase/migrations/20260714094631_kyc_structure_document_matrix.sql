-- Structure-driven KYC document matrix (client parity: kycVerification.util.ts).
-- 1) Widen organization_kyc_documents.doc_type CHECK
-- 2) Helper: org_has_kyc_document (org_kyc_documents ∪ verification_documents)
-- 3) Replace submit_business_verification(... p_gst_not_applicable) with matrix checks
--
-- Depends on 20261214100000_verification_document_type_structure_docs.sql

-- ─── 1. Doc type check ───────────────────────────────────────────────────────
ALTER TABLE public.organization_kyc_documents
  DROP CONSTRAINT IF EXISTS organization_kyc_documents_doc_type_check;

ALTER TABLE public.organization_kyc_documents
  ADD CONSTRAINT organization_kyc_documents_doc_type_check
  CHECK (doc_type = ANY (ARRAY[
    'gst_certificate'::text,
    'pan_card'::text,
    'cin_certificate'::text,
    'address_proof'::text,
    'msme_certificate'::text,
    'iec_certificate'::text,
    'incorporation_certificate'::text,
    'partnership_deed'::text,
    'llp_agreement'::text,
    'other'::text
  ]));

-- ─── 2. Shared presence helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_has_kyc_document(
  p_org_id uuid,
  VARIADIC p_types text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.organization_kyc_documents d
      WHERE d.organization_id = p_org_id
        AND d.deleted_at IS NULL
        AND d.storage_path IS NOT NULL
        AND NULLIF(TRIM(d.storage_path), '') IS NOT NULL
        AND d.doc_type = ANY (p_types)
    )
    OR EXISTS (
      SELECT 1
      FROM public.verification_documents v
      WHERE v.org_id = p_org_id
        AND v.status <> 'REPLACED'
        AND v.document_type::text = ANY (p_types)
    );
$$;

REVOKE ALL ON FUNCTION public.org_has_kyc_document(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_has_kyc_document(uuid, text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.org_has_kyc_document(uuid, text[]) IS
  'True if org has a non-deleted KYC upload matching any of p_types in organization_kyc_documents or verification_documents.';

-- ─── 3. Submit RPC (structure matrix) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_business_verification(
  p_org_id uuid,
  p_registration_type public.registration_type_enum DEFAULT NULL,
  p_address_pincode text DEFAULT NULL,
  p_address_proof_path text DEFAULT NULL,
  p_address_proof_type text DEFAULT NULL,
  p_gst_not_applicable boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role               text;
  v_current_status     public.kyc_verification_status;
  v_reg_type           public.registration_type_enum;
  v_gst_not_applicable boolean;
  v_cin                text;
  v_has_address_proof  boolean;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can submit for verification.';
  END IF;

  SELECT verification_status, registration_type, gst_not_applicable, cin
  INTO v_current_status, v_reg_type, v_gst_not_applicable, v_cin
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status NOT IN ('unverified', 'rejected') THEN
    RAISE EXCEPTION 'Profile is already % and cannot be resubmitted.', v_current_status;
  END IF;

  v_gst_not_applicable := COALESCE(p_gst_not_applicable, v_gst_not_applicable, false);
  v_reg_type := COALESCE(p_registration_type, v_reg_type);

  IF v_reg_type IS NULL THEN
    RAISE EXCEPTION 'Registration type must be selected before submitting.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND business_pan IS NOT NULL AND NULLIF(TRIM(business_pan), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAN must be saved before submitting.';
  END IF;

  IF NOT v_gst_not_applicable AND NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND gstin IS NOT NULL AND NULLIF(TRIM(gstin), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'GSTIN must be saved before submitting, or mark GST as not applicable.';
  END IF;

  -- Always: PAN card upload
  IF NOT public.org_has_kyc_document(p_org_id, 'pan_card') THEN
    RAISE EXCEPTION 'PAN card copy must be uploaded before submitting.';
  END IF;

  -- GST certificate when GST applies
  IF NOT v_gst_not_applicable
     AND NOT public.org_has_kyc_document(p_org_id, 'gst_certificate') THEN
    RAISE EXCEPTION 'GST registration certificate must be uploaded before submitting.';
  END IF;

  -- Address proof: legacy org column OR kyc docs OR verification address_proof_*
  v_has_address_proof :=
    public.org_has_kyc_document(p_org_id, 'address_proof')
    OR EXISTS (
      SELECT 1 FROM public.verification_documents v
      WHERE v.org_id = p_org_id
        AND v.status <> 'REPLACED'
        AND v.document_type::text LIKE 'address_proof_%'
    )
    OR (
      p_address_proof_path IS NOT NULL AND NULLIF(TRIM(p_address_proof_path), '') IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_org_id
        AND o.address_proof_path IS NOT NULL
        AND NULLIF(TRIM(o.address_proof_path), '') IS NOT NULL
    );

  IF NOT v_has_address_proof THEN
    RAISE EXCEPTION 'Address proof must be uploaded before submitting.';
  END IF;

  -- Structure-specific matrix
  IF v_reg_type = 'proprietorship' AND v_gst_not_applicable THEN
    -- RBI-style second evidence: Udyam, IEC, or GST cert if already on file
    IF NOT public.org_has_kyc_document(
      p_org_id, 'msme_certificate', 'iec_certificate', 'gst_certificate'
    ) THEN
      RAISE EXCEPTION
        'Proprietorship without GST requires an activity proof (Udyam or IEC).';
    END IF;
  ELSIF v_reg_type = 'partnership' THEN
    IF NOT public.org_has_kyc_document(p_org_id, 'partnership_deed') THEN
      RAISE EXCEPTION 'Partnership deed must be uploaded before submitting.';
    END IF;
  ELSIF v_reg_type IN ('pvt_ltd', 'public_ltd') THEN
    IF v_cin IS NULL OR NULLIF(TRIM(v_cin), '') IS NULL THEN
      RAISE EXCEPTION 'CIN must be saved before submitting for limited companies.';
    END IF;
    IF NOT public.org_has_kyc_document(
      p_org_id, 'incorporation_certificate', 'cin_certificate'
    ) THEN
      RAISE EXCEPTION
        'Incorporation / CIN certificate must be uploaded before submitting.';
    END IF;
  ELSIF v_reg_type = 'llp' THEN
    IF NOT public.org_has_kyc_document(
      p_org_id, 'incorporation_certificate', 'cin_certificate'
    ) THEN
      RAISE EXCEPTION 'LLP incorporation certificate must be uploaded before submitting.';
    END IF;
    IF NOT public.org_has_kyc_document(p_org_id, 'llp_agreement') THEN
      RAISE EXCEPTION 'LLP agreement must be uploaded before submitting.';
    END IF;
  END IF;

  UPDATE public.organizations SET
    registration_type   = v_reg_type,
    address_pincode     = COALESCE(NULLIF(TRIM(p_address_pincode), ''),   address_pincode),
    address_proof_path  = COALESCE(NULLIF(TRIM(p_address_proof_path), ''), address_proof_path),
    address_proof_type  = COALESCE(NULLIF(TRIM(p_address_proof_type), ''), address_proof_type),
    gst_not_applicable  = v_gst_not_applicable,
    verification_status = 'pending',
    frozen_at            = now(),
    submitted_at         = now(),
    rejection_reasons    = NULL,
    updated_at           = now()
  WHERE id = p_org_id;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, auth.uid(), v_current_status, 'pending', 'user_submitted');

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
$function$;
