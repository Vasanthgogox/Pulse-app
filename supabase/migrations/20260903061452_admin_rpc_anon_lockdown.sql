CREATE OR REPLACE FUNCTION public.admin_approve_profile(
  p_org_id uuid,
  p_admin_id uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_current_status public.kyc_verification_status;
  v_missing_docs    text[];
  v_actor           uuid;
BEGIN
  IF NOT (
    current_user = 'service_role'
    OR current_setting('role', true) = 'service_role'
    OR public.has_platform_permission((select auth.uid()), 'verification.approve')
  ) THEN
    RAISE EXCEPTION 'unauthorized: verification.approve permission required';
  END IF;

  v_actor := coalesce((select auth.uid()), p_admin_id);

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
    verified_by         = v_actor,
    updated_at          = now()
  WHERE id = p_org_id;

  UPDATE public.organization_kyc_documents
  SET
    status      = 'verified',
    verified_at = now(),
    verified_by = v_actor,
    updated_at  = now()
  WHERE organization_id = p_org_id
    AND status = 'pending'
    AND deleted_at IS NULL;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, v_actor, v_current_status, 'verified', p_notes);

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', p_org_id,
    'verification_status', 'verified',
    'previous_status', v_current_status::text
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reject_profile(
  p_org_id uuid,
  p_admin_id uuid,
  p_rejection_reasons jsonb,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_current_status public.kyc_verification_status;
  v_actor          uuid;
BEGIN
  IF NOT (
    current_user = 'service_role'
    OR current_setting('role', true) = 'service_role'
    OR public.has_platform_permission((select auth.uid()), 'verification.approve')
  ) THEN
    RAISE EXCEPTION 'unauthorized: verification.approve permission required';
  END IF;

  v_actor := coalesce((select auth.uid()), p_admin_id);

  IF p_rejection_reasons IS NULL
     OR jsonb_array_length(p_rejection_reasons->'checklist') = 0
  THEN
    RAISE EXCEPTION 'At least one rejection reason is required.';
  END IF;

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

  UPDATE public.organizations
  SET
    verification_status = 'rejected',
    frozen_at           = NULL,
    rejection_reasons   = p_rejection_reasons,
    kyc_rejected_reason = p_rejection_reasons->>'notes',
    updated_at          = now()
  WHERE id = p_org_id;

  UPDATE public.organization_kyc_documents
  SET
    status          = 'rejected',
    verified_at     = now(),
    verified_by     = v_actor,
    rejection_notes = coalesce(p_rejection_reasons->>'notes', p_notes),
    updated_at      = now()
  WHERE organization_id = p_org_id
    AND status = 'pending'
    AND deleted_at IS NULL;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, rejection_reasons, notes)
  VALUES
    (p_org_id, v_actor, v_current_status, 'rejected', p_rejection_reasons, p_notes);

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', p_org_id,
    'verification_status', 'rejected',
    'previous_status', v_current_status::text
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_approve_profile(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_approve_profile(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_reject_profile(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_reject_profile(uuid, uuid, jsonb, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.increment_credit_wallet(uuid, text, bigint, text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.increment_credit_wallet(uuid, text, bigint, text, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_boost_control_center() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_boost_control_center() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.driver_kyc_reopen_submission(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.driver_kyc_reopen_submission(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.platform_approve_driver_kyc_document(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.platform_approve_driver_kyc_document(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.platform_reject_driver_kyc_document(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.platform_reject_driver_kyc_document(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.platform_review_driver_kyc_submission(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.platform_review_driver_kyc_submission(uuid, text, text) TO authenticated, service_role;