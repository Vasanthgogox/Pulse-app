-- Exclude roster-from-LoadHub trips from "pending OTP" so driver never sees "ACCEPT & ENTER OTP" for asset trips.
-- Roster = source 'direct_quote' with driver_id and vehicle_id set at create; OTP is only for aggregate (ad hoc) flow.

CREATE OR REPLACE FUNCTION public.get_pending_otp_trips()
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid;
  v_phone text;
  v_normalized text;
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
    -- Roster-from-LoadHub (asset): do not show in pending OTP; driver sees trip in normal list with ACCEPT TRIP only.
    AND NOT (t.source = 'direct_quote' AND t.driver_id IS NOT NULL AND t.vehicle_id IS NOT NULL)
  ORDER BY t.pickup_date ASC NULLS LAST, t.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_pending_otp_trips() IS 'Driver app: trips pre-assigned to current user phone (last 10 digits) waiting for OTP claim. Excludes roster-from-LoadHub (asset) trips. SECURITY DEFINER.';
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
  FROM public.trip_otps o
  JOIN public.trips t ON t.id = o.trip_id
  JOIN public.drivers d ON d.id = t.driver_id
  WHERE o.used_at IS NULL
    AND o.expires_at > now()
    AND d.user_id IS NULL
    AND length(right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10)) >= 10
    AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = v_normalized
    -- Roster-from-LoadHub (asset): do not count; OTP only for aggregate flow.
    AND NOT (t.source = 'direct_quote' AND t.driver_id IS NOT NULL AND t.vehicle_id IS NOT NULL);

  RETURN jsonb_build_object('count', coalesce(v_count, 0));
END;
$$;

COMMENT ON FUNCTION public.get_pending_otp_claim_count() IS 'Driver app: count of trips pre-assigned to current user phone (last 10 digits) waiting for OTP claim. Excludes roster-from-LoadHub (asset) trips. SECURITY DEFINER.';
GRANT EXECUTE ON FUNCTION public.get_pending_otp_claim_count() TO authenticated;
