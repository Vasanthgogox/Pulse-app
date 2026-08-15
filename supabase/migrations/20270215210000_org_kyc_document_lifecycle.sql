-- Slice 3.1: admin_approve_profile / admin_reject_profile updated only
-- organizations.verification_status — organization_kyc_documents.status stayed
-- 'pending' forever regardless of outcome (confirmed live: 25/25 documents on
-- verified orgs still 'pending'). Mirrors the existing per-document write
-- already done for driver KYC (platform_approve_driver_kyc_document /
-- platform_reject_driver_kyc_document), applied in bulk since org-level
-- review approves/rejects a whole application at once, not one document at a
-- time. Only rows still 'pending' for this org are touched — already-
-- 'expired' or soft-deleted rows are left alone, so a re-verification never
-- silently re-verifies stale evidence.
--
-- Everything else in both function bodies is unchanged from the live
-- definitions (re-fetched via pg_get_functiondef before writing this).

CREATE OR REPLACE FUNCTION public.admin_approve_profile(p_org_id uuid, p_admin_id uuid, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status public.kyc_verification_status;
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

CREATE OR REPLACE FUNCTION public.admin_reject_profile(p_org_id uuid, p_admin_id uuid, p_rejection_reasons jsonb, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status public.kyc_verification_status;
BEGIN
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
    verified_by     = p_admin_id,
    rejection_notes = coalesce(p_rejection_reasons->>'notes', p_notes),
    updated_at      = now()
  WHERE organization_id = p_org_id
    AND status = 'pending'
    AND deleted_at IS NULL;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, rejection_reasons, notes)
  VALUES
    (p_org_id, p_admin_id, v_current_status, 'rejected', p_rejection_reasons, p_notes);

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', p_org_id,
    'verification_status', 'rejected',
    'previous_status', v_current_status::text
  );
END;
$function$;
