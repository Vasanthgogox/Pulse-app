-- Admin's Approve action had no completeness check anywhere — neither the
-- Admin UI button nor admin_approve_profile() itself verified that all
-- required document slots were satisfied before flipping an org to
-- 'verified'. Since AdminDataProvider.tsx's approveApp() calls
-- admin_approve_profile() directly (bypassing platform_approve_verification's
-- permission wrapper entirely), the RPC itself is the only place a check can
-- reliably land.
--
-- kyc_missing_required_documents() mirrors — does not duplicate — the
-- document-requirement branching already authoritative in the live
-- submit_business_verification() (PAN + address proof always; GST cert
-- unless gst_not_applicable; proprietorship-no-GST needs activity proof;
-- partnership needs a deed; pvt/public_ltd need CIN + incorporation cert;
-- llp needs incorporation cert + agreement), reusing the same
-- org_has_kyc_document() helper. submit_business_verification itself is not
-- touched.

CREATE OR REPLACE FUNCTION public.kyc_missing_required_documents(p_org_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg_type           public.registration_type_enum;
  v_gst_not_applicable boolean;
  v_missing            text[] := '{}';
BEGIN
  SELECT registration_type, gst_not_applicable
  INTO v_reg_type, v_gst_not_applicable
  FROM public.organizations
  WHERE id = p_org_id;

  IF NOT public.org_has_kyc_document(p_org_id, 'pan_card') THEN
    v_missing := array_append(v_missing, 'Business PAN card');
  END IF;

  IF NOT coalesce(v_gst_not_applicable, false)
     AND NOT public.org_has_kyc_document(p_org_id, 'gst_certificate') THEN
    v_missing := array_append(v_missing, 'GST registration certificate');
  END IF;

  IF NOT (
    public.org_has_kyc_document(p_org_id, 'address_proof')
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_org_id
        AND NULLIF(TRIM(o.address_proof_path), '') IS NOT NULL
    )
  ) THEN
    v_missing := array_append(v_missing, 'Business address proof');
  END IF;

  IF v_reg_type = 'proprietorship' AND coalesce(v_gst_not_applicable, false) THEN
    IF NOT public.org_has_kyc_document(
      p_org_id, 'msme_certificate', 'iec_certificate', 'gst_certificate'
    ) THEN
      v_missing := array_append(v_missing, 'Activity proof (Udyam or IEC)');
    END IF;
  ELSIF v_reg_type = 'partnership' THEN
    IF NOT public.org_has_kyc_document(p_org_id, 'partnership_deed') THEN
      v_missing := array_append(v_missing, 'Partnership deed');
    END IF;
  ELSIF v_reg_type IN ('pvt_ltd', 'public_ltd') THEN
    IF NOT public.org_has_kyc_document(
      p_org_id, 'incorporation_certificate', 'cin_certificate'
    ) THEN
      v_missing := array_append(v_missing, 'Certificate of Incorporation');
    END IF;
  ELSIF v_reg_type = 'llp' THEN
    IF NOT public.org_has_kyc_document(
      p_org_id, 'incorporation_certificate', 'cin_certificate'
    ) THEN
      v_missing := array_append(v_missing, 'Certificate of Incorporation');
    END IF;
    IF NOT public.org_has_kyc_document(p_org_id, 'llp_agreement') THEN
      v_missing := array_append(v_missing, 'LLP agreement');
    END IF;
  END IF;

  RETURN v_missing;
END;
$function$;

REVOKE ALL ON FUNCTION public.kyc_missing_required_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kyc_missing_required_documents(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_approve_profile(p_org_id uuid, p_admin_id uuid, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status public.kyc_verification_status;
  v_missing_docs    text[];
BEGIN
  SELECT verification_status INTO v_current_status
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Organization not found: %', p_org_id;
  END IF;

  IF v_current_status NOT IN ('pending', 'unverified') THEN
    RAISE EXCEPTION 'Profile is not awaiting review. Current status: %', v_current_status;
  END IF;

  v_missing_docs := public.kyc_missing_required_documents(p_org_id);
  IF array_length(v_missing_docs, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot approve — missing required documents: %', array_to_string(v_missing_docs, ', ');
  END IF;

  UPDATE public.organizations
  SET
    verification_status = 'verified',
    verified_at         = now(),
    verified_by         = p_admin_id,
    updated_at          = now()
  WHERE id = p_org_id;

  UPDATE public.organization_kyc_documents
  SET
    status      = 'verified',
    verified_at = now(),
    verified_by = p_admin_id,
    updated_at  = now()
  WHERE organization_id = p_org_id
    AND status = 'pending'
    AND deleted_at IS NULL;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, p_admin_id, v_current_status, 'verified', p_notes);

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', p_org_id,
    'verification_status', 'verified',
    'previous_status', v_current_status::text
  );
END;
$function$;
