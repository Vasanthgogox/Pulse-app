-- Roster driver invites (phone-based), auto-link on signup, OTP hardening, backfill.

-- ── 2. Extend driver_invites for roster (no platform user yet) ───────────────

ALTER TABLE public.driver_invites
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS phone_normalised text,
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT now() + interval '7 days',
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

ALTER TABLE public.driver_invites
  ALTER COLUMN to_user_id DROP NOT NULL;

ALTER TABLE public.driver_invites
  DROP CONSTRAINT IF EXISTS driver_invites_status_check;

ALTER TABLE public.driver_invites
  ADD CONSTRAINT driver_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'consumed', 'expired'));

CREATE INDEX IF NOT EXISTS idx_driver_invites_phone_normalised_pending
  ON public.driver_invites (phone_normalised)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_driver_invites_driver_id
  ON public.driver_invites (driver_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_invites_pending_roster_driver
  ON public.driver_invites (driver_id)
  WHERE status = 'pending' AND driver_id IS NOT NULL AND to_user_id IS NULL;

COMMENT ON COLUMN public.driver_invites.driver_id IS
  'Roster driver row for phone-based invite (to_user_id null until consumed).';

-- RLS: org members read roster invites they sent (platform invites unchanged)
DROP POLICY IF EXISTS "Org members can read invites sent by their org" ON public.driver_invites;
CREATE POLICY "Org members can read invites sent by their org"
  ON public.driver_invites FOR SELECT
  USING (public.is_org_member(from_organization_id));

-- ── 3. invite_driver RPC ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invite_driver(
  p_phone text,
  p_name text,
  p_org_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_norm text := public.normalise_phone(p_phone);
  v_driver_id uuid;
  v_invite_id uuid;
  v_org_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  IF length(coalesce(v_phone_norm, '')) < 10 THEN
    RAISE EXCEPTION 'Valid phone required';
  END IF;

  SELECT id INTO v_driver_id
  FROM public.drivers
  WHERE phone_normalised = v_phone_norm
    AND organization_id = p_org_id
    AND left_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    INSERT INTO public.drivers (name, phone, organization_id, status)
    VALUES (
      coalesce(nullif(trim(p_name), ''), 'Driver'),
      nullif(trim(p_phone), ''),
      p_org_id,
      'offline'
    )
    RETURNING id INTO v_driver_id;
  END IF;

  UPDATE public.driver_invites
  SET status = 'expired'
  WHERE driver_id = v_driver_id
    AND status = 'pending'
    AND to_user_id IS NULL;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

  INSERT INTO public.driver_invites (
    driver_id,
    from_organization_id,
    phone_normalised,
    invited_by,
    to_user_id,
    invitee_name,
    from_org_name,
    status,
    expires_at
  )
  VALUES (
    v_driver_id,
    p_org_id,
    v_phone_norm,
    auth.uid(),
    NULL,
    coalesce(nullif(trim(p_name), ''), 'Driver'),
    coalesce(v_org_name, 'Company'),
    'pending',
    now() + interval '7 days'
  )
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$;

COMMENT ON FUNCTION public.invite_driver(text, text, uuid) IS
  'Dispatcher-led roster invite: find/create unlinked driver row and return invite UUID for deep link / OTP flows.';

GRANT EXECUTE ON FUNCTION public.invite_driver(text, text, uuid) TO authenticated;

-- ── 4. consume_driver_invite RPC ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.consume_driver_invite(p_invite_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.driver_invites%ROWTYPE;
  v_auth_phone text;
  v_auth_norm text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_invite
  FROM public.driver_invites
  WHERE id = p_invite_id
    AND status = 'pending'
    AND expires_at > now()
    AND driver_id IS NOT NULL
    AND to_user_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT coalesce(
    nullif(trim(p.phone), ''),
    nullif(trim(u.phone::text), ''),
    nullif(trim(u.raw_user_meta_data->>'phone'), '')
  )
  INTO v_auth_phone
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();

  v_auth_norm := public.normalise_phone(v_auth_phone);
  IF length(coalesce(v_auth_norm, '')) < 10
     OR v_auth_norm <> v_invite.phone_normalised THEN
    RETURN false;
  END IF;

  UPDATE public.drivers
  SET user_id = auth.uid(),
      status = 'offline',
      updated_at = now()
  WHERE id = v_invite.driver_id
    AND user_id IS NULL;

  UPDATE public.driver_invites
  SET status = 'consumed',
      consumed_at = now(),
      to_user_id = auth.uid()
  WHERE id = p_invite_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.consume_driver_invite(uuid) IS
  'Driver app: after phone OTP auth, link roster driver row when invite token + phone match.';

GRANT EXECUTE ON FUNCTION public.consume_driver_invite(uuid) TO authenticated;

-- ── 5. Auto-link roster driver on auth signup ───────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_auto_link_driver_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_norm text;
  v_driver_id uuid;
  v_raw_phone text;
BEGIN
  v_raw_phone := coalesce(
    nullif(trim(NEW.phone::text), ''),
    nullif(trim(NEW.raw_user_meta_data->>'phone'), '')
  );

  IF v_raw_phone IS NULL OR v_raw_phone = '' THEN
    RETURN NEW;
  END IF;

  v_phone_norm := public.normalise_phone(v_raw_phone);
  IF length(coalesce(v_phone_norm, '')) < 10 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_driver_id
  FROM public.drivers
  WHERE phone_normalised = v_phone_norm
    AND user_id IS NULL
    AND left_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_driver_id IS NOT NULL THEN
    UPDATE public.drivers
    SET user_id = NEW.id,
        status = 'offline',
        updated_at = now()
    WHERE id = v_driver_id
      AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_link_driver_on_signup ON auth.users;
CREATE TRIGGER auto_link_driver_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_link_driver_on_signup();

-- ── 6. Harden get_pending_otp_trips + claim_trip_by_otp ─────────────────────

CREATE OR REPLACE FUNCTION public.get_pending_otp_trips()
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE
AS $$
DECLARE
  v_uid uuid;
  v_phone text;
  v_normalized text;
  v_trip_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(
    nullif(trim(p.phone), ''),
    nullif(trim(u.phone::text), ''),
    nullif(trim(u.raw_user_meta_data->>'phone'), '')
  )
  INTO v_phone
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_uid;

  v_normalized := public.normalise_phone(v_phone);
  IF length(coalesce(v_normalized, '')) < 10 THEN
    RETURN;
  END IF;

  FOR v_trip_id IN
    SELECT t.id
    FROM public.trips t
    JOIN public.drivers d ON d.id = t.driver_id
    WHERE d.user_id IS NULL
      AND d.phone_normalised IS NOT NULL
      AND length(d.phone_normalised) >= 10
      AND d.phone_normalised = v_normalized
      AND lower(coalesce(t.status, '')) IN ('assigned', 'pending', 'scheduled')
      AND NOT (t.source = 'direct_quote' AND t.driver_id IS NOT NULL AND t.vehicle_id IS NOT NULL)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.trip_otps o
      WHERE o.trip_id = v_trip_id
        AND o.used_at IS NULL
        AND o.expires_at > now()
    ) THEN
      PERFORM public.generate_trip_otp(v_trip_id, 15);
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT t.*
  FROM public.trip_otps o
  JOIN public.trips t ON t.id = o.trip_id
  JOIN public.drivers d ON d.id = t.driver_id
  WHERE o.used_at IS NULL
    AND o.expires_at > now()
    AND d.user_id IS NULL
    AND d.phone_normalised IS NOT NULL
    AND length(d.phone_normalised) >= 10
    AND d.phone_normalised = v_normalized
    AND lower(coalesce(t.status, '')) IN ('assigned', 'pending', 'scheduled')
    AND NOT (t.source = 'direct_quote' AND t.driver_id IS NOT NULL AND t.vehicle_id IS NOT NULL)
  ORDER BY t.pickup_date ASC NULLS LAST, t.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_otp_claim_count()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_phone text;
  v_normalized text;
  v_count int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('count', 0);
  END IF;

  SELECT coalesce(
    nullif(trim(p.phone), ''),
    nullif(trim(u.phone::text), ''),
    nullif(trim(u.raw_user_meta_data->>'phone'), '')
  )
  INTO v_phone
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_uid;

  v_normalized := public.normalise_phone(v_phone);
  IF length(coalesce(v_normalized, '')) < 10 THEN
    RETURN jsonb_build_object('count', 0);
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.trips t
  JOIN public.drivers d ON d.id = t.driver_id
  WHERE d.user_id IS NULL
    AND d.phone_normalised IS NOT NULL
    AND length(d.phone_normalised) >= 10
    AND d.phone_normalised = v_normalized
    AND lower(coalesce(t.status, '')) IN ('assigned', 'pending', 'scheduled')
    AND NOT (t.source = 'direct_quote' AND t.driver_id IS NOT NULL AND t.vehicle_id IS NOT NULL);

  RETURN jsonb_build_object('count', coalesce(v_count, 0));
END;
$$;

-- claim_trip_by_otp: use phone_normalised; permanently link user_id on claim
CREATE OR REPLACE FUNCTION public.claim_trip_by_otp(
  p_code text,
  p_max_attempts int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id uuid;
  v_org_id uuid;
  v_uid uuid;
  v_driver_id uuid;
  v_driver_name text;
  v_row trip_otps%ROWTYPE;
  v_updated int;
  v_preassigned_driver_id uuid;
  v_allowed_norm text;
  v_claimant_phone text;
  v_normalized_claimant text;
  v_existing_driver_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_row FROM public.trip_otps WHERE trip_otps.code = trim(coalesce(p_code, '')) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired OTP');
  END IF;

  IF v_row.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired OTP');
  END IF;

  IF v_row.expires_at <= now() THEN
    UPDATE public.trip_otps SET failed_attempts = failed_attempts + 1 WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired OTP');
  END IF;

  IF v_row.failed_attempts >= greatest(1, p_max_attempts) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many attempts. Ask for a new OTP.');
  END IF;

  UPDATE public.trip_otps
  SET used_at = now()
  WHERE id = v_row.id
    AND used_at IS NULL
    AND expires_at > now()
    AND failed_attempts < greatest(1, p_max_attempts)
  RETURNING trip_id INTO v_trip_id;

  IF v_trip_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired OTP');
  END IF;

  SELECT organization_id INTO v_org_id FROM public.trips WHERE id = v_trip_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trip not found');
  END IF;

  SELECT t.driver_id, d.phone_normalised
  INTO v_preassigned_driver_id, v_allowed_norm
  FROM public.trips t
  LEFT JOIN public.drivers d ON d.id = t.driver_id
  WHERE t.id = v_trip_id;

  IF v_preassigned_driver_id IS NOT NULL
     AND v_allowed_norm IS NOT NULL
     AND length(v_allowed_norm) >= 10 THEN

    SELECT coalesce(
      nullif(trim(p.phone), ''),
      nullif(trim(u.phone::text), ''),
      nullif(trim(u.raw_user_meta_data->>'phone'), '')
    )
    INTO v_claimant_phone
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = v_uid;

    v_normalized_claimant := public.normalise_phone(v_claimant_phone);

    IF length(coalesce(v_normalized_claimant, '')) < 10 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Only the driver with the registered mobile number can claim this trip. Add your phone in profile or sign in with that number.'
      );
    END IF;

    IF v_normalized_claimant <> v_allowed_norm THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Only the driver with the registered mobile number can claim this trip.'
      );
    END IF;

    UPDATE public.drivers
    SET user_id = v_uid,
        status = 'offline',
        updated_at = now()
    WHERE id = v_preassigned_driver_id
      AND user_id IS NULL;

    RETURN jsonb_build_object(
      'ok', true,
      'trip_id', v_trip_id,
      'organization_id', v_org_id,
      'driver_id', v_preassigned_driver_id
    );
  END IF;

  SELECT id INTO v_existing_driver_id
  FROM public.drivers
  WHERE organization_id = v_org_id AND user_id = v_uid
  LIMIT 1;

  IF v_existing_driver_id IS NOT NULL THEN
    v_driver_id := v_existing_driver_id;
  ELSE
    SELECT coalesce(
      nullif(trim(p.phone), ''),
      nullif(trim(u.phone::text), ''),
      nullif(trim(u.raw_user_meta_data->>'phone'), '')
    )
    INTO v_claimant_phone
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = v_uid;

    v_normalized_claimant := public.normalise_phone(v_claimant_phone);

    IF length(coalesce(v_normalized_claimant, '')) >= 10 THEN
      SELECT id INTO v_existing_driver_id
      FROM public.drivers
      WHERE organization_id = v_org_id
        AND phone_normalised = v_normalized_claimant
        AND left_at IS NULL
      LIMIT 1;
    END IF;

    IF v_existing_driver_id IS NOT NULL THEN
      UPDATE public.drivers
      SET user_id = v_uid,
          status = 'offline',
          updated_at = now()
      WHERE id = v_existing_driver_id
        AND user_id IS NULL;
      v_driver_id := v_existing_driver_id;
    END IF;
  END IF;

  IF v_driver_id IS NULL THEN
    SELECT trim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''))
    INTO v_driver_name FROM auth.users WHERE id = v_uid;
    IF coalesce(v_driver_name, '') = '' THEN
      v_driver_name := 'Driver';
    END IF;
    INSERT INTO public.drivers (organization_id, user_id, name, phone, status, tracking_only)
    VALUES (v_org_id, v_uid, v_driver_name, NULL, 'offline', true)
    RETURNING id INTO v_driver_id;
  END IF;

  UPDATE public.trips
  SET driver_id = v_driver_id, updated_at = now()
  WHERE id = v_trip_id AND driver_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trip already claimed by another driver');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'trip_id', v_trip_id,
    'organization_id', v_org_id,
    'driver_id', v_driver_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_otp_trips() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_otp_claim_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trip_by_otp(text, int) TO authenticated;

-- sync_driver_rows_user_id_for_profile: prefer phone_normalised column
CREATE OR REPLACE FUNCTION public.sync_driver_rows_user_id_for_profile(p_profile_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_email_norm text;
  v_last10 text;
  v_n int := 0;
BEGIN
  SELECT p.role,
         nullif(lower(trim(coalesce(p.email, ''))), ''),
         public.normalise_phone(p.phone)
    INTO v_role, v_email_norm, v_last10
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF NOT FOUND OR coalesce(v_role, '') <> 'driver' THEN
    RETURN 0;
  END IF;

  UPDATE public.drivers d
  SET user_id = p_profile_id,
      status = 'offline',
      updated_at = now()
  WHERE d.user_id IS NULL
    AND d.left_at IS NULL
    AND (
      (v_email_norm IS NOT NULL AND v_email_norm <> ''
        AND nullif(lower(trim(coalesce(d.email, ''))), '') = v_email_norm)
      OR (
        length(coalesce(v_last10, '')) >= 10
        AND d.phone_normalised = v_last10
      )
    );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── 9. Backfill unlinked roster drivers with matching auth phones ─────────────

UPDATE public.drivers d
SET user_id = au.id,
    status = 'offline',
    updated_at = now()
FROM auth.users au
WHERE d.user_id IS NULL
  AND d.left_at IS NULL
  AND d.phone_normalised IS NOT NULL
  AND length(d.phone_normalised) >= 10
  AND public.normalise_phone(
    coalesce(
      nullif(trim(au.phone::text), ''),
      nullif(trim(au.raw_user_meta_data->>'phone'), '')
    )
  ) = d.phone_normalised;
