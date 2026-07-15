-- Fix: driver notifications dropping assigned trips when aggregate phone-assigned trips
-- are missing/expired OTP rows.
--
-- Root cause:
-- 1) assign_aggregate_trip_driver could assign a tracking-only driver without creating trip_otps.
-- 2) get_pending_otp_trips only returned rows that already had a valid OTP.
--
-- Result: a legitimately assigned trip could disappear from driver notifications/dashboard.
--
-- This migration makes the flow reliable by:
-- - always ensuring an OTP exists when assigning aggregate trip by phone
-- - making get_pending_otp_trips self-heal missing/expired OTPs for eligible assignments
-- - keeping get_pending_otp_claim_count aligned with the same assignment eligibility logic

CREATE OR REPLACE FUNCTION public.assign_aggregate_trip_driver(
  p_trip_id uuid,
  p_driver_org_id uuid,
  p_driver_phone text,
  p_vehicle_display_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
  v_driver public.drivers%ROWTYPE;
  v_phone_norm text;
  v_last10 text;
  v_driver_name text;
  v_profile_id uuid;
BEGIN
  v_phone_norm := trim(regexp_replace(coalesce(p_driver_phone, ''), '\s+', '', 'g'));
  if length(v_phone_norm) < 10 then
    return jsonb_build_object('ok', false, 'error', 'Phone required (at least 10 digits)');
  end if;
  v_last10 := regexp_replace(v_phone_norm, '\D', '', 'g');
  if length(v_last10) >= 10 then
    v_last10 := right(v_last10, 10);
  else
    v_last10 := v_phone_norm;
  end if;

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trip not found');
  END IF;

  -- Caller must be trip org (shipper) or supplier for this trip
  IF NOT (
    public.is_org_member(v_trip.organization_id)
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = v_trip.supplier_id
        AND s.linked_organization_id IS NOT NULL
        AND public.is_org_member(s.linked_organization_id)
    )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized to assign this trip');
  END IF;

  -- Find existing driver in org by phone (exact then last 10 digits)
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE organization_id = p_driver_org_id
    AND (
      phone = v_phone_norm
      OR right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
    )
  ORDER BY case when phone = v_phone_norm then 0 else 1 end
  LIMIT 1;

  IF NOT FOUND THEN
    -- Resolve name from profiles by phone (optional)
    SELECT id, full_name INTO v_profile_id, v_driver_name
    FROM public.profiles
    WHERE length(phone) >= 10
      AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
    LIMIT 1;
    v_driver_name := coalesce(trim(v_driver_name), 'Driver');
    IF v_driver_name = '' THEN v_driver_name := 'Driver'; END IF;

    INSERT INTO public.drivers (organization_id, name, phone, user_id, status, tracking_only)
    VALUES (p_driver_org_id, v_driver_name, v_phone_norm, NULL, 'offline', true)
    RETURNING * INTO v_driver;
  END IF;

  UPDATE public.trips
  SET
    driver_id = v_driver.id,
    vehicle_display_number = CASE
      WHEN p_vehicle_display_number IS NOT NULL AND trim(p_vehicle_display_number) <> '' THEN trim(p_vehicle_display_number)
      ELSE vehicle_display_number
    END,
    status = 'assigned',
    updated_at = now()
  WHERE id = p_trip_id;

  -- Guarantee OTP availability for phone-claim flow so assignments never disappear from driver pending list.
  PERFORM public.generate_trip_otp(p_trip_id, 15);

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;

  RETURN jsonb_build_object(
    'ok', true,
    'trip', to_jsonb(v_trip),
    'driver_id', v_driver.id
  );
END;
$$;

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

  SELECT coalesce(p.phone, u.raw_user_meta_data->>'phone') INTO v_phone
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_uid;

  v_phone := coalesce(v_phone, '');
  v_normalized := right(regexp_replace(v_phone, '\D', '', 'g'), 10);
  IF length(v_normalized) < 10 THEN
    RETURN;
  END IF;

  -- Self-heal: if an eligible phone-assigned trip has no valid OTP, create one.
  FOR v_trip_id IN
    SELECT t.id
    FROM public.trips t
    JOIN public.drivers d ON d.id = t.driver_id
    WHERE d.user_id IS NULL
      AND length(right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10)) >= 10
      AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = v_normalized
      AND lower(coalesce(t.status, '')) IN ('assigned', 'pending', 'scheduled')
      -- Roster-from-LoadHub (asset): OTP flow not applicable.
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
    AND length(right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10)) >= 10
    AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = v_normalized
    AND lower(coalesce(t.status, '')) IN ('assigned', 'pending', 'scheduled')
    AND NOT (t.source = 'direct_quote' AND t.driver_id IS NOT NULL AND t.vehicle_id IS NOT NULL)
  ORDER BY t.pickup_date ASC NULLS LAST, t.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_pending_otp_trips() IS 'Driver app: returns phone-assigned pending trips waiting for OTP claim; self-heals missing/expired OTP rows. Excludes roster-from-LoadHub trips.';
GRANT EXECUTE ON FUNCTION public.get_pending_otp_trips() TO authenticated;

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

  SELECT coalesce(p.phone, u.raw_user_meta_data->>'phone') INTO v_phone
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_uid;

  v_phone := coalesce(v_phone, '');
  v_normalized := right(regexp_replace(v_phone, '\D', '', 'g'), 10);
  IF length(v_normalized) < 10 THEN
    RETURN jsonb_build_object('count', 0);
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.trips t
  JOIN public.drivers d ON d.id = t.driver_id
  WHERE d.user_id IS NULL
    AND length(right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10)) >= 10
    AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = v_normalized
    AND lower(coalesce(t.status, '')) IN ('assigned', 'pending', 'scheduled')
    AND NOT (t.source = 'direct_quote' AND t.driver_id IS NOT NULL AND t.vehicle_id IS NOT NULL);

  RETURN jsonb_build_object('count', coalesce(v_count, 0));
END;
$$;

COMMENT ON FUNCTION public.get_pending_otp_claim_count() IS 'Driver app: count of phone-assigned pending trips awaiting OTP claim (self-healing list logic alignment). Excludes roster-from-LoadHub trips.';
GRANT EXECUTE ON FUNCTION public.get_pending_otp_claim_count() TO authenticated;
