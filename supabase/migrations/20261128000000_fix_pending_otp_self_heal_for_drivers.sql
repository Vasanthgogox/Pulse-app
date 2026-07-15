-- get_pending_otp_trips self-heals expired OTPs via generate_trip_otp, but that RPC
-- requires org membership (20260430173000). Drivers calling get_pending_otp_trips are
-- not org members, so self-heal fails and no pending trips are returned.

CREATE OR REPLACE FUNCTION public.ensure_trip_otp_for_phone_assigned_driver(
  p_trip_id uuid,
  p_ttl_minutes int DEFAULT 15
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_phone text;
  v_normalized text;
  v_code text;
  v_expires_at timestamptz;
  v_ttl int;
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.drivers d ON d.id = t.driver_id
    WHERE t.id = p_trip_id
      AND d.user_id IS NULL
      AND d.phone_normalised IS NOT NULL
      AND length(d.phone_normalised) >= 10
      AND d.phone_normalised = v_normalized
      AND lower(coalesce(t.status, '')) IN ('assigned', 'pending', 'scheduled')
      AND NOT (
        t.source = 'direct_quote'
        AND t.driver_id IS NOT NULL
        AND t.vehicle_id IS NOT NULL
      )
  ) THEN
    RETURN;
  END IF;

  v_ttl := greatest(1, least(coalesce(p_ttl_minutes, 15), 1440));
  LOOP
    v_code := lpad(floor(random() * 1000000)::text, 6, '0');
    v_expires_at := now() + (v_ttl || ' minutes')::interval;
    INSERT INTO public.trip_otps (trip_id, code, expires_at, used_at, failed_attempts)
    VALUES (p_trip_id, v_code, v_expires_at, NULL, 0)
    ON CONFLICT (trip_id) DO UPDATE
    SET code = EXCLUDED.code,
        expires_at = EXCLUDED.expires_at,
        used_at = NULL,
        failed_attempts = 0,
        created_at = now();
    RETURN;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.ensure_trip_otp_for_phone_assigned_driver(uuid, int) IS
  'Driver-safe OTP upsert for phone-preassigned trips (no org membership required). Used by get_pending_otp_trips self-heal.';

REVOKE ALL ON FUNCTION public.ensure_trip_otp_for_phone_assigned_driver(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_trip_otp_for_phone_assigned_driver(uuid, int) TO authenticated;

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
      PERFORM public.ensure_trip_otp_for_phone_assigned_driver(v_trip_id, 15);
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

COMMENT ON FUNCTION public.get_pending_otp_trips() IS
  'Driver app: phone-preassigned trips waiting for OTP claim; self-heals via ensure_trip_otp_for_phone_assigned_driver.';

GRANT EXECUTE ON FUNCTION public.get_pending_otp_trips() TO authenticated;
