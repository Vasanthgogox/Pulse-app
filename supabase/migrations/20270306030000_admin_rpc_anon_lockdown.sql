-- SECURITY: close anon EXECUTE on the admin console's RPCs, and guard the two
-- profile-verification functions that had no authorization check at all.
--
-- Found while mapping the console's service_role surface. Two distinct problems:
--
-- 1. admin_approve_profile / admin_reject_profile had NO permission check of any
--    kind, were not SECURITY DEFINER, and took the acting admin as a plain
--    caller-supplied parameter (p_admin_id) that nothing verified. Combined with
--    (2), any unauthenticated caller who could reach the REST endpoint could
--    approve or reject any organization's KYC verification and write an audit-log
--    row attributing it to whichever admin uuid they chose. The audit trail would
--    look entirely normal afterwards.
--
-- 2. All eight admin RPCs were executable by `anon`. PostgreSQL grants EXECUTE to
--    PUBLIC on function creation, and `anon` inherits PUBLIC -- the exact gap
--    20270302020000 already documented and fixed for the two Support RPCs. The
--    other six do have permission guards internally, so anon calls failed, but
--    they should never have been reachable in the first place.
--
-- Fix: revoke from PUBLIC/anon across all eight, and give the two profile RPCs
-- the same guard the rest already use. Their bodies are otherwise preserved
-- exactly -- including the FOR UPDATE lock, the status precondition, the missing-
-- document check, the cascade to organization_kyc_documents, and the audit row.
--
-- p_admin_id is kept in both signatures so no caller breaks, but it is now
-- IGNORED in favour of auth.uid(): the actor is whoever is actually signed in,
-- never whoever the request claims. For a service_role caller (no auth.uid())
-- the passed value is still honoured, preserving existing server-side behaviour.
--
-- These functions become SECURITY DEFINER because a real admin's session has no
-- direct write privilege on organizations / organization_kyc_documents /
-- verification_audit_logs -- the same reason every other platform_* RPC is.

-- ── 1. Guarded profile approval ──────────────────────────────────────────────
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
  -- Trusted server-side caller, or a real admin holding verification.approve.
  IF NOT (
    current_user = 'service_role'
    OR current_setting('role', true) = 'service_role'
    OR public.has_platform_permission((select auth.uid()), 'verification.approve')
  ) THEN
    RAISE EXCEPTION 'unauthorized: verification.approve permission required';
  END IF;

  -- The signed-in admin wins over anything the caller passed.
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

-- ── 2. Guarded profile rejection ─────────────────────────────────────────────
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

-- ── 3. Revoke anon EXECUTE across every admin RPC ────────────────────────────
-- `authenticated` is granted deliberately: each of these guards the caller
-- internally, so a signed-in non-admin still gets "unauthorized". That is what
-- lets the console move off the service_role key.

REVOKE EXECUTE ON FUNCTION public.admin_approve_profile(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_approve_profile(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_reject_profile(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_reject_profile(uuid, uuid, jsonb, text) TO authenticated, service_role;

-- increment_credit_wallet already guards on credits.issue internally and is used
-- by the Credits panel; anon must not reach it regardless.
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
