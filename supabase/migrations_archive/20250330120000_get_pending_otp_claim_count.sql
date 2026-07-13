-- RPC for driver app: count of trips assigned to current user's phone (pre-assigned, not yet claimed).
-- Driver sees "You have N trip(s) waiting — enter OTP to claim" when count > 0.
-- SECURITY DEFINER so we can read trips/drivers/trip_otps without RLS (driver row has user_id null until claim).

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
  v_normalized := trim(regexp_replace(v_phone, '\s+', '', 'g'));
  IF v_normalized = '' THEN
    RETURN jsonb_build_object('count', 0);
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.trip_otps o
  JOIN public.trips t ON t.id = o.trip_id
  JOIN public.drivers d ON d.id = t.driver_id
  WHERE o.used_at IS NULL
    AND o.expires_at > now()
    AND d.user_id IS NULL
    AND trim(regexp_replace(coalesce(d.phone, ''), '\s+', '', 'g')) = v_normalized;

  RETURN jsonb_build_object('count', coalesce(v_count, 0));
END;
$$;

COMMENT ON FUNCTION public.get_pending_otp_claim_count() IS 'Driver app: count of trips pre-assigned to current user phone (by driver for tracking) that are waiting for OTP claim. SECURITY DEFINER.';
GRANT EXECUTE ON FUNCTION public.get_pending_otp_claim_count() TO authenticated;
