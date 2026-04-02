-- Restrict OTP claim to the pre-assigned driver's phone.
-- When trip.driver_id is set (from "Driver for tracking" at create), only the user whose phone
-- matches that driver's phone can claim. Otherwise return error. On match, link driver row to auth.uid().

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
    -- Only the driver with the registered mobile number can claim
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

  -- No pre-assigned driver: legacy flow — find or create driver for auth.uid(), set trip.driver_id
  SELECT id, name INTO v_driver_id, v_driver_name
  FROM public.drivers
  WHERE organization_id = v_org_id AND user_id = v_uid
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    SELECT trim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''))
    INTO v_driver_name FROM auth.users WHERE id = v_uid;
    IF coalesce(v_driver_name, '') = '' THEN
      v_driver_name := 'Driver';
    END IF;
    -- Driver created via OTP claim only for this aggregate trip should not appear in fleet Drivers tab.
    -- Mark as tracking_only = true so mobile excludes from drivers list (one-time tracking driver).
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

COMMENT ON FUNCTION public.claim_trip_by_otp(text, int) IS 'Claim aggregate trip by OTP. When trip has pre-assigned driver (driver for tracking), only claimant whose phone matches that driver can claim; else find/create driver by auth.uid() and assign. OTP-created drivers are tracking_only so they do not appear in Drivers tab. Race-safe. O(1).';
