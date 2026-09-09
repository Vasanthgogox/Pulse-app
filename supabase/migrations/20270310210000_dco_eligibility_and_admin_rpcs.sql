-- DCO-4 implementation, part 2/3: the eligibility predicate and the
-- approval-lifecycle RPCs. No marketplace function is touched here (that is
-- part 3) -- this migration only makes the new predicate and admin actions
-- available.
--
-- Eligibility predicate resolved in DCO-4.1's trace: "dco_profiles.status =
-- 'APPROVED' AND no active organization_members row with role='driver'."
-- This reuses the exact live definition submit_driver_direct_bid() already
-- uses for "is this person a driver somewhere" -- not drivers.relationship_status
-- (confirmed, via live trigger inspection, to be an independent, per-org-row
-- axis with no sync to organization_members; unreliable as a person-level
-- "currently employed" fact) and explicitly not is_driver_fleet_owner()
-- (confirmed to represent an unrelated, permanent, self-service capability
-- with zero connection to employment).
--
-- Internal predicate, NOT a client-facing API: it takes an arbitrary
-- p_user_id, not necessarily auth.uid(), so granting EXECUTE to
-- authenticated would let any signed-in user probe whether an arbitrary
-- other person is an approved DCO. Only other SECURITY DEFINER functions
-- (submit_market_bid, create_market_trip_after_fee_payment,
-- accept_driver_direct_bid) call this -- they run as this function's owner
-- for the duration of their body, so the owner's implicit privilege is what
-- matters, not a grant to authenticated. No GRANT TO authenticated below,
-- deliberately.
CREATE OR REPLACE FUNCTION public.is_dco_eligible(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.dco_profiles dp
      WHERE dp.user_id = p_user_id AND dp.status = 'APPROVED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = p_user_id AND om.role = 'driver' AND om.status = 'active'
    );
$function$;

REVOKE ALL ON FUNCTION public.is_dco_eligible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_dco_eligible(uuid) FROM authenticated;

-- Pure lookup, no eligibility re-check -- deliberately separate from
-- is_dco_eligible(). Per the locked DCO-4 contract: "Path A: classify from
-- the persisted winning bid's bidder_type='dco', not from the bidder's
-- current profile state." A dco_payees row can only ever exist for someone
-- who was approved at least once (created exactly once, in
-- platform_approve_dco, below) -- so its mere existence is exactly the
-- right thing to trust for an already-awarded commitment, independent of
-- whatever the person's CURRENT dco_profiles.status says.
--
-- Also internal-only, same rationale as is_dco_eligible() above: this
-- returns another person's dco_payees.id given an arbitrary p_user_id, so
-- it must never be directly callable by a signed-in client -- only from
-- within the SECURITY DEFINER trip-creation functions, which inherit their
-- own owner's implicit privilege to call it.
CREATE OR REPLACE FUNCTION public.get_dco_payee_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT id FROM public.dco_payees WHERE user_id = p_user_id;
$function$;

REVOKE ALL ON FUNCTION public.get_dco_payee_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dco_payee_id(uuid) FROM authenticated;

-- New platform permission, inserted as a data row into the existing generic
-- lookup table -- no new permission architecture, exactly as DCO-3 resolved
-- (platform_permissions already holds driver_kyc.review, marketplace_fees.manage,
-- etc. side by side; dco.review is simply one more).
INSERT INTO public.platform_permissions (key, description)
VALUES ('dco.review', 'Review, approve, reject, suspend, or reinstate DCO status requests')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_review_dco()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT current_user = 'service_role'
    OR current_setting('role', true) = 'service_role'
    OR public.has_platform_permission((select auth.uid()), 'dco.review');
$function$;

-- Self-service request. Driver-only (mirrors submit_market_bid's own
-- driver-identity assumptions). Allows re-requesting after a REJECTED
-- decision (upsert), but never touches an existing PENDING/APPROVED/
-- SUSPENDED row -- those can only change via the admin RPCs below.
CREATE OR REPLACE FUNCTION public.request_dco_status()
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_row public.dco_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'driver') THEN
    RAISE EXCEPTION 'unauthorized: DCO status can only be requested by a driver-role profile';
  END IF;

  INSERT INTO public.dco_profiles (user_id, status, requested_at)
  VALUES (v_uid, 'PENDING', now())
  ON CONFLICT (user_id) DO UPDATE SET
    status = 'PENDING',
    requested_at = now(),
    reviewed_at = NULL,
    reviewed_by = NULL,
    decision_reason = NULL,
    updated_at = now()
  WHERE public.dco_profiles.status = 'REJECTED'
  RETURNING * INTO v_row;

  IF v_row.user_id IS NULL THEN
    SELECT * INTO v_row FROM public.dco_profiles WHERE user_id = v_uid;
    RAISE EXCEPTION 'invalid_state: a DCO request already exists with status % -- cannot re-request', v_row.status;
  END IF;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_dco_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_dco_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_approve_dco(p_user_id uuid)
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.dco_profiles;
BEGIN
  IF NOT public.can_review_dco() THEN
    RAISE EXCEPTION 'unauthorized: dco.review permission required';
  END IF;

  UPDATE public.dco_profiles
  SET status = 'APPROVED', reviewed_at = now(), reviewed_by = (select auth.uid()),
      decision_reason = NULL, updated_at = now()
  WHERE user_id = p_user_id AND status = 'PENDING'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no PENDING dco_profiles row for user %', p_user_id;
  END IF;

  -- Created exactly once. A re-approval after a prior SUSPENDED->APPROVED
  -- cycle never reaches here (that path is platform_reinstate_dco, which
  -- requires status='SUSPENDED' and never touches dco_payees either) -- so
  -- this INSERT only ever fires on a person's genuinely first approval.
  INSERT INTO public.dco_payees (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.emit_platform_event(
    'DcoApproved', NULL, jsonb_build_object('user_id', p_user_id)
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_approve_dco(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_approve_dco(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_reject_dco(p_user_id uuid, p_reason text)
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.dco_profiles;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.can_review_dco() THEN
    RAISE EXCEPTION 'unauthorized: dco.review permission required';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE public.dco_profiles
  SET status = 'REJECTED', reviewed_at = now(), reviewed_by = (select auth.uid()),
      decision_reason = v_reason, updated_at = now()
  WHERE user_id = p_user_id AND status = 'PENDING'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no PENDING dco_profiles row for user %', p_user_id;
  END IF;

  PERFORM public.emit_platform_event(
    'DcoRejected', NULL, jsonb_build_object('user_id', p_user_id, 'reason', v_reason)
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_reject_dco(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_reject_dco(uuid, text) TO authenticated;

-- Suspension blocks FUTURE marketplace activity (via is_dco_eligible, which
-- checks dco_profiles.status = 'APPROVED') but deliberately never touches
-- dco_payees or any trip already created -- the locked DCO-4 contract's
-- "post-award suspension does not invalidate an already-accepted bid"
-- invariant, applied one level up: it also must not retroactively unwind a
-- trip that already exists.
CREATE OR REPLACE FUNCTION public.platform_suspend_dco(p_user_id uuid, p_reason text)
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.dco_profiles;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.can_review_dco() THEN
    RAISE EXCEPTION 'unauthorized: dco.review permission required';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'suspension_reason_required';
  END IF;

  UPDATE public.dco_profiles
  SET status = 'SUSPENDED', reviewed_at = now(), reviewed_by = (select auth.uid()),
      decision_reason = v_reason, updated_at = now()
  WHERE user_id = p_user_id AND status = 'APPROVED'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no APPROVED dco_profiles row for user %', p_user_id;
  END IF;

  PERFORM public.emit_platform_event(
    'DcoSuspended', NULL, jsonb_build_object('user_id', p_user_id, 'reason', v_reason)
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_suspend_dco(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_suspend_dco(uuid, text) TO authenticated;

-- Direct reinstatement, not a re-review: suspension is a pause, not a
-- fresh rejection, so this returns straight to APPROVED rather than routing
-- back through PENDING. dco_payees is untouched (it was never touched by
-- suspend either).
CREATE OR REPLACE FUNCTION public.platform_reinstate_dco(p_user_id uuid)
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.dco_profiles;
BEGIN
  IF NOT public.can_review_dco() THEN
    RAISE EXCEPTION 'unauthorized: dco.review permission required';
  END IF;

  UPDATE public.dco_profiles
  SET status = 'APPROVED', reviewed_at = now(), reviewed_by = (select auth.uid()),
      decision_reason = NULL, updated_at = now()
  WHERE user_id = p_user_id AND status = 'SUSPENDED'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no SUSPENDED dco_profiles row for user %', p_user_id;
  END IF;

  PERFORM public.emit_platform_event(
    'DcoReinstated', NULL, jsonb_build_object('user_id', p_user_id)
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_reinstate_dco(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_reinstate_dco(uuid) TO authenticated;

-- Terminal-state-requires-explicit-reopen, mirroring driver_kyc_reopen_submission's
-- established pattern exactly: a REJECTED decision does not silently become
-- re-reviewable just because request_dco_status() would also do that same
-- transition -- this RPC exists so an ADMIN (not the applicant) can also
-- reopen one, e.g. after receiving new information out of band.
CREATE OR REPLACE FUNCTION public.dco_reopen_rejected(p_user_id uuid)
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.dco_profiles;
BEGIN
  IF NOT public.can_review_dco() THEN
    RAISE EXCEPTION 'unauthorized: dco.review permission required';
  END IF;

  UPDATE public.dco_profiles
  SET status = 'PENDING', reviewed_at = NULL, reviewed_by = NULL,
      decision_reason = NULL, requested_at = now(), updated_at = now()
  WHERE user_id = p_user_id AND status = 'REJECTED'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no REJECTED dco_profiles row for user %', p_user_id;
  END IF;

  PERFORM public.emit_platform_event(
    'DcoReopened', NULL, jsonb_build_object('user_id', p_user_id)
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.dco_reopen_rejected(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dco_reopen_rejected(uuid) TO authenticated;
