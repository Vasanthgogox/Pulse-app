-- Applied on remote as 20260716062940.
-- Allow admin approve/reject on orgs shown in the console queue as "Pending"
-- (verification_status = unverified) as well as user-submitted pending rows.
-- The admin console maps unverified → Pending; the RPC previously required pending only.
--
-- History note: an empty local stub (20260716062349) and a later duplicate
-- (20261205000000) were removed; this file restores Local=Remote parity.

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
