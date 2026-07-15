-- Harden driver signup matching: backfill, on-demand ensure, drivers-row sync, profile index.
-- Complexity: backfill O(P) profiles; ensure O(M) matching profiles (typically 1, indexed); status O(1) per call.

-- Speed up reverse lookup: driver phone -> profiles with same last-10 (role=driver).
CREATE INDEX IF NOT EXISTS idx_profiles_driver_phone_last10
  ON public.profiles ((right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)))
  WHERE role = 'driver' AND phone IS NOT NULL AND trim(phone) <> '';

COMMENT ON INDEX public.idx_profiles_driver_phone_last10 IS 'Supports O(k) signup-match ensure where k = profiles sharing last-10 digits.';

-- Ensure match rows exist for one manual driver row (caller must be org member — enforced in get/send).
CREATE OR REPLACE FUNCTION public.ensure_driver_signup_matches_for_driver(p_driver_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_last10 text;
  v_inserted integer := 0;
  v_org_id uuid;
BEGIN
  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_org_id := v_driver.organization_id;
  IF NOT public.is_org_member(v_org_id) THEN
    RETURN 0;
  END IF;

  IF v_driver.user_id IS NOT NULL OR v_driver.left_at IS NOT NULL THEN
    RETURN 0;
  END IF;
  IF coalesce(trim(v_driver.phone), '') = '' THEN
    RETURN 0;
  END IF;

  v_last10 := public.normalize_phone_last10(v_driver.phone);
  IF length(v_last10) < 10 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.driver_signup_matches (
    organization_id, driver_id, matched_user_id, phone_canonical, state, source
  )
  SELECT
    v_driver.organization_id,
    v_driver.id,
    p.id,
    v_last10,
    'pending_owner_action',
    'signup_phone_match'
  FROM public.profiles p
  WHERE p.role = 'driver'
    AND coalesce(trim(p.phone), '') <> ''
    AND public.normalize_phone_last10(p.phone) = v_last10
  ON CONFLICT (driver_id, matched_user_id) DO UPDATE SET
    phone_canonical = EXCLUDED.phone_canonical,
    state = CASE
      WHEN public.driver_signup_matches.state IN ('ignored', 'declined', 'expired')
      THEN 'pending_owner_action'
      ELSE public.driver_signup_matches.state
    END,
    detected_at = CASE
      WHEN public.driver_signup_matches.state IN ('ignored', 'declined', 'expired')
      THEN now()
      ELSE public.driver_signup_matches.detected_at
    END,
    metadata = public.driver_signup_matches.metadata
      || jsonb_build_object('reactivated_at', now())
  WHERE public.driver_signup_matches.state IN ('ignored', 'declined', 'expired');

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.ensure_driver_signup_matches_for_driver(uuid) IS 'Idempotent: create pending signup matches for unlinked driver row vs all driver profiles with same phone (last 10). Org members only (checked).';

REVOKE ALL ON FUNCTION public.ensure_driver_signup_matches_for_driver(uuid) FROM PUBLIC;

-- Status RPC: org check + ensure + latest actionable row (prefer pending over invite_sent).
CREATE OR REPLACE FUNCTION public.get_driver_signup_match_status(p_driver_id uuid)
RETURNS TABLE (
  id uuid,
  state text,
  matched_user_id uuid,
  detected_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT d.organization_id INTO v_org_id FROM public.drivers d WHERE d.id = p_driver_id;
  IF v_org_id IS NULL OR NOT public.is_org_member(v_org_id) THEN
    RETURN;
  END IF;

  PERFORM public.ensure_driver_signup_matches_for_driver(p_driver_id);

  RETURN QUERY
  SELECT m.id, m.state, m.matched_user_id, m.detected_at
  FROM public.driver_signup_matches m
  WHERE m.driver_id = p_driver_id
    AND m.state IN ('pending_owner_action', 'invite_sent')
  ORDER BY
    CASE m.state WHEN 'pending_owner_action' THEN 0 WHEN 'invite_sent' THEN 1 ELSE 2 END,
    m.detected_at DESC
  LIMIT 1;
END;
$$;

-- Send invite: re-ensure in case profile landed after last open; handle invite race (unique violation).
CREATE OR REPLACE FUNCTION public.send_driver_signup_match_invite(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers;
  v_match public.driver_signup_matches;
  v_existing_status text;
  v_invite_id uuid;
BEGIN
  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;
  IF NOT public.is_org_member(v_driver.organization_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_driver.user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Driver already linked to an app account');
  END IF;

  PERFORM public.ensure_driver_signup_matches_for_driver(p_driver_id);

  SELECT *
  INTO v_match
  FROM public.driver_signup_matches
  WHERE driver_id = p_driver_id
    AND state IN ('pending_owner_action', 'invite_sent')
  ORDER BY
    CASE state WHEN 'pending_owner_action' THEN 0 WHEN 'invite_sent' THEN 1 ELSE 2 END,
    detected_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No pending signup match');
  END IF;

  SELECT di.status INTO v_existing_status
  FROM public.driver_invites di
  WHERE di.from_organization_id = v_driver.organization_id
    AND di.to_user_id = v_match.matched_user_id
  LIMIT 1;

  IF v_existing_status IS NOT NULL THEN
    UPDATE public.driver_signup_matches
    SET state = 'invite_sent',
        acted_at = now(),
        acted_by = auth.uid(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('invite_status', v_existing_status)
    WHERE id = v_match.id;
    RETURN jsonb_build_object('ok', true, 'already_exists', true, 'status', v_existing_status);
  END IF;

  BEGIN
    INSERT INTO public.driver_invites (
      from_organization_id,
      to_user_id,
      status,
      invitee_name
    ) VALUES (
      v_driver.organization_id,
      v_match.matched_user_id,
      'pending',
      nullif(trim(coalesce(v_driver.name, '')), '')
    )
    RETURNING id INTO v_invite_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT di.status INTO v_existing_status
      FROM public.driver_invites di
      WHERE di.from_organization_id = v_driver.organization_id
        AND di.to_user_id = v_match.matched_user_id
      LIMIT 1;
      UPDATE public.driver_signup_matches
      SET state = 'invite_sent',
          acted_at = now(),
          acted_by = auth.uid(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('invite_status', coalesce(v_existing_status, 'pending'), 'race', true)
      WHERE id = v_match.id;
      RETURN jsonb_build_object('ok', true, 'already_exists', true, 'status', coalesce(v_existing_status, 'pending'));
  END;

  UPDATE public.driver_signup_matches
  SET state = 'invite_sent',
      acted_at = now(),
      acted_by = auth.uid(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('invite_id', v_invite_id)
  WHERE id = v_match.id;

  RETURN jsonb_build_object('ok', true, 'already_exists', false, 'invite_id', v_invite_id, 'status', 'pending');
END;
$$;

-- When fleet links driver row or changes phone / disconnects, keep signup_matches consistent.
CREATE OR REPLACE FUNCTION public.trg_drivers_sync_signup_matches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_last10 text;
BEGIN
  -- Driver left fleet: expire pending outreach for this roster row.
  IF NEW.left_at IS NOT NULL AND (TG_OP = 'UPDATE' AND (OLD.left_at IS NULL OR OLD.left_at IS DISTINCT FROM NEW.left_at)) THEN
    UPDATE public.driver_signup_matches
    SET state = 'expired',
        acted_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reason', 'driver_left_fleet')
    WHERE driver_id = NEW.id
      AND state IN ('pending_owner_action', 'invite_sent');
  END IF;

  -- Phone changed on manual row: expire matches that no longer match.
  IF TG_OP = 'UPDATE'
     AND NEW.user_id IS NULL
     AND NEW.phone IS DISTINCT FROM OLD.phone
     AND coalesce(trim(NEW.phone), '') <> '' THEN
    v_new_last10 := public.normalize_phone_last10(NEW.phone);
    UPDATE public.driver_signup_matches
    SET state = 'expired',
        acted_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reason', 'driver_phone_changed')
    WHERE driver_id = NEW.id
      AND state IN ('pending_owner_action', 'invite_sent')
      AND phone_canonical IS DISTINCT FROM v_new_last10;
  END IF;

  -- Row linked to app user (invite accept, attach_driver_by_contact, OTP, etc.)
  -- INSERT: NEW.user_id set. UPDATE: user_id newly set or changed (avoid OLD on INSERT).
  IF NEW.user_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND (OLD.user_id IS NULL OR OLD.user_id IS DISTINCT FROM NEW.user_id))
     ) THEN
    UPDATE public.driver_signup_matches
    SET state = 'linked',
        acted_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reason', 'driver_row_linked')
    WHERE driver_id = NEW.id
      AND matched_user_id = NEW.user_id
      AND state IN ('pending_owner_action', 'invite_sent', 'ignored', 'declined');

    UPDATE public.driver_signup_matches
    SET state = 'expired',
        acted_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reason', 'driver_linked_other_user')
    WHERE driver_id = NEW.id
      AND matched_user_id IS DISTINCT FROM NEW.user_id
      AND state IN ('pending_owner_action', 'invite_sent');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drivers_sync_signup_matches ON public.drivers;
CREATE TRIGGER trg_drivers_sync_signup_matches
  AFTER INSERT OR UPDATE OF user_id, phone, left_at ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_drivers_sync_signup_matches();

-- Owner dismisses pending match (still can use Link / invite later after re-detection if phone+profile still match).
CREATE OR REPLACE FUNCTION public.dismiss_driver_signup_match(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_count integer := 0;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.drivers WHERE id = p_driver_id;
  IF v_org_id IS NULL OR NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.driver_signup_matches
  SET state = 'ignored',
      acted_at = now(),
      acted_by = auth.uid(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reason', 'owner_dismissed')
  WHERE driver_id = p_driver_id
    AND state = 'pending_owner_action';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'dismissed', v_count);
END;
$$;

COMMENT ON FUNCTION public.dismiss_driver_signup_match(uuid) IS 'Fleet user ignores pending signup match for a manual driver row.';

GRANT EXECUTE ON FUNCTION public.dismiss_driver_signup_match(uuid) TO authenticated;

-- Align enqueue (profiles trigger) with ensure: re-open ignored/declined/expired when driver signs up / phone updates.
CREATE OR REPLACE FUNCTION public.enqueue_driver_signup_matches(
  p_user_id uuid,
  p_phone text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last10 text;
  v_affected integer := 0;
BEGIN
  v_last10 := public.normalize_phone_last10(p_phone);
  IF length(v_last10) < 10 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.driver_signup_matches (
    organization_id, driver_id, matched_user_id, phone_canonical, state, source
  )
  SELECT
    d.organization_id,
    d.id,
    p_user_id,
    v_last10,
    'pending_owner_action',
    'signup_phone_match'
  FROM public.drivers d
  WHERE d.user_id IS NULL
    AND d.left_at IS NULL
    AND d.phone IS NOT NULL
    AND public.normalize_phone_last10(d.phone) = v_last10
  ON CONFLICT (driver_id, matched_user_id) DO UPDATE SET
    phone_canonical = EXCLUDED.phone_canonical,
    state = CASE
      WHEN public.driver_signup_matches.state IN ('ignored', 'declined', 'expired')
      THEN 'pending_owner_action'
      ELSE public.driver_signup_matches.state
    END,
    detected_at = CASE
      WHEN public.driver_signup_matches.state IN ('ignored', 'declined', 'expired')
      THEN now()
      ELSE public.driver_signup_matches.detected_at
    END,
    metadata = public.driver_signup_matches.metadata
      || jsonb_build_object('reactivated_from_profile_trigger', now())
  WHERE public.driver_signup_matches.state IN ('ignored', 'declined', 'expired');

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

COMMENT ON FUNCTION public.enqueue_driver_signup_matches(uuid, text) IS 'Create or re-open pending signup matches for manual driver rows vs signed-up driver phone (last 10 digits). Idempotent.';

-- One-time backfill: profiles created before the profiles trigger existed.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id, p.phone
    FROM public.profiles p
    WHERE p.role = 'driver'
      AND coalesce(trim(p.phone), '') <> ''
  LOOP
    PERFORM public.enqueue_driver_signup_matches(r.id, r.phone);
  END LOOP;
END $$;
