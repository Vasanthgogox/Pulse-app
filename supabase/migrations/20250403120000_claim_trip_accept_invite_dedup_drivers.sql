-- Prevent duplicate driver rows for the same person (same phone or user) in the same org.
-- 1) claim_trip_by_otp (no pre-assigned): reuse existing driver in org by claimant phone or user_id.
-- 2) accept_driver_invite: reuse existing driver in org by to_user_id or phone instead of inserting.

-- 1) claim_trip_by_otp: in the "no pre-assigned driver" branch, find by user_id OR claimant phone; reuse and link.
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
  v_allowed_phone text;
  v_claimant_phone text;
  v_normalized_allowed text;
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

  -- Pre-assigned driver (from "Driver for tracking" at create): trip.driver_id and that driver's phone
  SELECT t.driver_id, d.phone INTO v_preassigned_driver_id, v_allowed_phone
  FROM public.trips t
  LEFT JOIN public.drivers d ON d.id = t.driver_id
  WHERE t.id = v_trip_id;

  IF v_preassigned_driver_id IS NOT NULL AND v_allowed_phone IS NOT NULL AND trim(v_allowed_phone) <> '' THEN
    v_normalized_allowed := trim(regexp_replace(coalesce(v_allowed_phone, ''), '\s+', '', 'g'));

    SELECT coalesce(p.phone, u.raw_user_meta_data->>'phone') INTO v_claimant_phone
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = v_uid;

    v_claimant_phone := coalesce(v_claimant_phone, '');
    v_normalized_claimant := trim(regexp_replace(v_claimant_phone, '\s+', '', 'g'));

    IF v_normalized_claimant = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only the driver with the registered mobile number can claim this trip. Add your phone in profile or sign in with that number.');
    END IF;

    IF v_normalized_claimant <> v_normalized_allowed THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Only the driver with the registered mobile number can claim this trip.');
    END IF;

    -- Link the pre-assigned driver row to the claiming user
    UPDATE public.drivers
    SET user_id = v_uid, updated_at = now()
    WHERE id = v_preassigned_driver_id;

    RETURN jsonb_build_object(
      'ok', true,
      'trip_id', v_trip_id,
      'organization_id', v_org_id,
      'driver_id', v_preassigned_driver_id
    );
  END IF;

  -- No pre-assigned driver: find existing driver by (org, user_id) OR (org, claimant phone); reuse to avoid duplicate.
  SELECT id INTO v_existing_driver_id
  FROM public.drivers
  WHERE organization_id = v_org_id AND user_id = v_uid
  LIMIT 1;

  IF v_existing_driver_id IS NOT NULL THEN
    v_driver_id := v_existing_driver_id;
  ELSE
    -- Look for driver in this org with same phone as claimant (e.g. row created by assign-by-phone, user_id still null)
    SELECT coalesce(p.phone, u.raw_user_meta_data->>'phone') INTO v_claimant_phone
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = v_uid;
    v_claimant_phone := coalesce(v_claimant_phone, '');
    v_normalized_claimant := trim(regexp_replace(v_claimant_phone, '\s+', '', 'g'));

    IF v_normalized_claimant <> '' THEN
      SELECT id INTO v_existing_driver_id
      FROM public.drivers
      WHERE organization_id = v_org_id
        AND phone IS NOT NULL
        AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = v_normalized_claimant
      LIMIT 1;
    END IF;

    IF v_existing_driver_id IS NOT NULL THEN
      -- Reuse existing row: link to claiming user so we don't create a duplicate
      UPDATE public.drivers
      SET user_id = v_uid, updated_at = now()
      WHERE id = v_existing_driver_id;
      v_driver_id := v_existing_driver_id;
    END IF;
  END IF;

  IF v_driver_id IS NULL THEN
    -- No existing driver in this org: create one (tracking_only so excluded from Drivers tab)
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

COMMENT ON FUNCTION public.claim_trip_by_otp(text, int) IS 'Claim aggregate trip by OTP. Pre-assigned: only claimant with matching phone can claim. No pre-assigned: find driver by org+user_id or org+claimant phone and reuse to avoid duplicate; else create tracking_only driver. Race-safe.';

-- 2) accept_driver_invite: reuse existing driver in org (by user_id or phone) instead of inserting a duplicate.
CREATE OR REPLACE FUNCTION public.accept_driver_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.driver_invites;
  v_driver_id uuid;
  v_name text;
  v_phone text;
  v_email text;
BEGIN
  SELECT * INTO v_invite FROM public.driver_invites WHERE id = p_invite_id AND to_user_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found or already responded'; END IF;

  SELECT coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), nullif(trim(raw_user_meta_data->>'name'), ''), 'Driver'),
         nullif(trim(raw_user_meta_data->>'phone'), ''), nullif(trim(email), '')
    INTO v_name, v_phone, v_email FROM auth.users WHERE id = auth.uid();

  -- Reuse existing driver in this org: same user_id (e.g. already linked from OTP) or same phone (e.g. assign-by-phone row).
  SELECT id INTO v_driver_id
  FROM public.drivers
  WHERE organization_id = v_invite.from_organization_id
    AND (user_id = auth.uid()
         OR (v_phone IS NOT NULL AND v_phone <> '' AND phone IS NOT NULL
             AND trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = trim(regexp_replace(coalesce(v_phone, ''), '\s+', '', 'g'))))
  ORDER BY (user_id = auth.uid()) DESC
  LIMIT 1;

  IF v_driver_id IS NOT NULL THEN
    -- Update existing row: link user, refresh name/phone/email, clear tracking_only so they appear in Drivers tab
    UPDATE public.drivers
    SET user_id = auth.uid(),
        name = coalesce(nullif(trim(v_name), ''), name),
        phone = coalesce(nullif(trim(v_phone), ''), phone),
        email = coalesce(nullif(trim(v_email), ''), email),
        tracking_only = false,
        updated_at = now()
    WHERE id = v_driver_id;
  ELSE
    -- No existing row: insert new driver
    INSERT INTO public.drivers (organization_id, name, phone, email, user_id, status)
    VALUES (v_invite.from_organization_id, coalesce(v_name, 'Driver'), v_phone, v_email, auth.uid(), 'offline')
    RETURNING id INTO v_driver_id;
  END IF;

  UPDATE public.driver_invites SET status = 'accepted', responded_at = now(), responded_by = auth.uid() WHERE id = p_invite_id;
  RETURN jsonb_build_object('driver_id', v_driver_id, 'organization_id', v_invite.from_organization_id);
END;
$$;

COMMENT ON FUNCTION public.accept_driver_invite(uuid) IS 'Accept fleet invite: reuse existing driver in org (by user_id or phone) to avoid duplicate; else insert. Reused rows get tracking_only = false.';
