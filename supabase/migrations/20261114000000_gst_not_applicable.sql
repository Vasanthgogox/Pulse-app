-- =============================================================================
-- Support businesses without a GSTIN (below GST registration threshold /
-- exempt categories) in the business verification wizard.
-- =============================================================================
-- submit_business_verification previously hard-required gstin + a
-- gst_certificate upload for every organization, with no way to complete
-- verification for a legitimately unregistered-for-GST business. Adds a
-- flag the user can set to skip both requirements; PAN + address proof
-- remain mandatory in all cases.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS gst_not_applicable boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.submit_business_verification(
  p_org_id             uuid,
  p_registration_type  public.registration_type_enum DEFAULT NULL,
  p_address_pincode    text DEFAULT NULL,
  p_address_proof_path text DEFAULT NULL,
  p_address_proof_type text DEFAULT NULL,
  p_gst_not_applicable boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role               text;
  v_current_status     public.kyc_verification_status;
  v_reg_type           public.registration_type_enum;
  v_has_gst_cert       boolean;
  v_has_pan_card       boolean;
  v_gst_not_applicable boolean;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can submit for verification.';
  END IF;

  SELECT verification_status, registration_type, gst_not_applicable
  INTO v_current_status, v_reg_type, v_gst_not_applicable
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status NOT IN ('unverified', 'rejected') THEN
    RAISE EXCEPTION 'Profile is already % and cannot be resubmitted.', v_current_status;
  END IF;

  -- Persist the flag first so the checks below (and the stored row) agree
  -- on the final value for this submission.
  v_gst_not_applicable := COALESCE(p_gst_not_applicable, v_gst_not_applicable, false);

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND business_pan IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAN must be saved before submitting.';
  END IF;

  IF NOT v_gst_not_applicable AND NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND gstin IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'GSTIN must be saved before submitting, or mark GST as not applicable.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.verification_documents
    WHERE org_id = p_org_id AND document_type = 'gst_certificate' AND status <> 'REPLACED'
  ) INTO v_has_gst_cert;

  SELECT EXISTS (
    SELECT 1 FROM public.verification_documents
    WHERE org_id = p_org_id AND document_type = 'pan_card' AND status <> 'REPLACED'
  ) INTO v_has_pan_card;

  IF NOT v_gst_not_applicable AND NOT v_has_gst_cert THEN
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
