-- Detect when a manually-added driver later signs up with same phone.
-- Queue an org-side "ready to invite" state and wire into existing driver_invites flow.

CREATE TABLE IF NOT EXISTS public.driver_signup_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  matched_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_canonical text NOT NULL,
  state text NOT NULL DEFAULT 'pending_owner_action'
    CHECK (state IN ('pending_owner_action', 'invite_sent', 'linked', 'declined', 'ignored', 'expired')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  acted_at timestamptz,
  acted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'signup_phone_match',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_signup_matches_driver_user_unique
  ON public.driver_signup_matches(driver_id, matched_user_id);
CREATE INDEX IF NOT EXISTS idx_driver_signup_matches_org_state_detected
  ON public.driver_signup_matches(organization_id, state, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_signup_matches_user_state
  ON public.driver_signup_matches(matched_user_id, state);
CREATE INDEX IF NOT EXISTS idx_driver_signup_matches_driver_state
  ON public.driver_signup_matches(driver_id, state, detected_at DESC);

-- Expression index for O(1)-ish lookup of unmatched manual drivers by last 10 digits.
CREATE INDEX IF NOT EXISTS idx_drivers_unlinked_phone_last10
  ON public.drivers ((right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)))
  WHERE user_id IS NULL AND left_at IS NULL AND phone IS NOT NULL;

COMMENT ON TABLE public.driver_signup_matches IS 'Tracks matches between manually-added drivers (unlinked rows) and later app signups by phone.';

CREATE OR REPLACE FUNCTION public.normalize_phone_last10(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

-- Detect signup phone matches and enqueue owner actions.
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
  v_inserted integer := 0;
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
  ON CONFLICT (driver_id, matched_user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.enqueue_driver_signup_matches(uuid, text) IS 'Create pending owner-action match rows for manual driver records that match signed-up driver phone (last 10 digits). Idempotent.';

-- Trigger bridge: when profile is inserted/updated for a driver with phone, enqueue matches.
CREATE OR REPLACE FUNCTION public.trg_profiles_enqueue_driver_signup_matches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.role, '') = 'driver'
     AND coalesce(trim(NEW.phone), '') <> '' THEN
    PERFORM public.enqueue_driver_signup_matches(NEW.id, NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_enqueue_driver_signup_matches ON public.profiles;
CREATE TRIGGER trg_profiles_enqueue_driver_signup_matches
  AFTER INSERT OR UPDATE OF role, phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_enqueue_driver_signup_matches();

-- Owner app reads current signup-match state for a driver profile card.
CREATE OR REPLACE FUNCTION public.get_driver_signup_match_status(
  p_driver_id uuid
)
RETURNS TABLE (
  id uuid,
  state text,
  matched_user_id uuid,
  detected_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.state, m.matched_user_id, m.detected_at
  FROM public.driver_signup_matches m
  JOIN public.drivers d ON d.id = m.driver_id
  WHERE m.driver_id = p_driver_id
    AND public.is_org_member(d.organization_id)
    AND m.state IN ('pending_owner_action', 'invite_sent')
  ORDER BY m.detected_at DESC
  LIMIT 1;
$$;

-- Owner action: send invite for matched signup using existing driver_invites flow.
CREATE OR REPLACE FUNCTION public.send_driver_signup_match_invite(
  p_driver_id uuid
)
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

  SELECT *
  INTO v_match
  FROM public.driver_signup_matches
  WHERE driver_id = p_driver_id
    AND state IN ('pending_owner_action', 'invite_sent')
  ORDER BY detected_at DESC
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

  UPDATE public.driver_signup_matches
  SET state = 'invite_sent',
      acted_at = now(),
      acted_by = auth.uid(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('invite_id', v_invite_id)
  WHERE id = v_match.id;

  RETURN jsonb_build_object('ok', true, 'already_exists', false, 'invite_id', v_invite_id, 'status', 'pending');
END;
$$;

-- Mark match row linked after invite acceptance (keeps state in sync with existing accept flow).
CREATE OR REPLACE FUNCTION public.mark_driver_signup_match_linked_from_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.driver_signup_matches
    SET state = 'linked',
        acted_at = now(),
        acted_by = coalesce(NEW.responded_by, auth.uid()),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('accepted_invite_id', NEW.id)
    WHERE organization_id = NEW.from_organization_id
      AND matched_user_id = NEW.to_user_id
      AND state IN ('pending_owner_action', 'invite_sent', 'ignored', 'declined');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_invites_mark_signup_match_linked ON public.driver_invites;
CREATE TRIGGER trg_driver_invites_mark_signup_match_linked
  AFTER UPDATE OF status ON public.driver_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_driver_signup_match_linked_from_invite();

ALTER TABLE public.driver_signup_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read driver signup matches" ON public.driver_signup_matches;
CREATE POLICY "Org members can read driver signup matches"
  ON public.driver_signup_matches FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org members can update driver signup matches" ON public.driver_signup_matches;
CREATE POLICY "Org members can update driver signup matches"
  ON public.driver_signup_matches FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT EXECUTE ON FUNCTION public.normalize_phone_last10(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_driver_signup_matches(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_signup_match_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_driver_signup_match_invite(uuid) TO authenticated;
GRANT SELECT, UPDATE ON public.driver_signup_matches TO authenticated;
