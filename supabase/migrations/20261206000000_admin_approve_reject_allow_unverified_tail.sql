-- Tail migration to keep fresh replays consistent with production behavior.
--
-- Problem:
-- - 20261113000000 converts admin approve/reject procedures to functions, but
--   reintroduces a strict `pending`-only status check.
-- - Earlier (20260716) we want admin approve/reject to also work for `unverified`
--   orgs shown as "Pending" in the admin console queue.
--
-- This migration re-applies the unverified-aware function bodies AFTER the
-- conversion migration so a full `supabase db reset` ends with the intended
-- behavior without rewriting history.
--
-- NOTE: This is idempotent and safe to apply on existing environments.
-- It only replaces function bodies and reasserts grants.

CREATE OR REPLACE FUNCTION public.admin_approve_profile(
  p_org_id    uuid,
  p_admin_id  uuid,
  p_notes     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_profile(
  p_org_id            uuid,
  p_admin_id          uuid,
  p_rejection_reasons jsonb,
  p_notes             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_profile(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_profile(uuid, uuid, jsonb, text) TO service_role;

