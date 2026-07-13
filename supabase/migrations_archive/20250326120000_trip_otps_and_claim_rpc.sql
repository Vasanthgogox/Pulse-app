-- Trip OTPs: one-time codes for aggregate trips so drivers can claim by OTP, then link phone for tracking.
-- O(1) lookup by code (unique index); single-use, time-bound; race-safe claim via atomic UPDATE.

-- Config: TTL and max failed attempts (used in RPCs; can be moved to app/env later).
-- Defaults: 15 min TTL, 5 max attempts.
CREATE TABLE IF NOT EXISTS public.trip_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz DEFAULT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(trip_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_otps_code ON public.trip_otps(code);
CREATE INDEX IF NOT EXISTS idx_trip_otps_trip_id ON public.trip_otps(trip_id);

COMMENT ON TABLE public.trip_otps IS 'One OTP per aggregate trip; driver claims with code, then phone links for tracking. Single-use, time-bound.';

-- Generate OTP for a trip (aggregate only). Upsert by trip_id so regeneration overwrites. O(1).
CREATE OR REPLACE FUNCTION public.generate_trip_otp(
  p_trip_id uuid,
  p_ttl_minutes int DEFAULT 15
)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_expires_at timestamptz;
  v_ttl int;
BEGIN
  v_ttl := greatest(1, least(coalesce(p_ttl_minutes, 15), 1440));
  -- 6-digit numeric code; collision retry via loop (rare)
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
    RETURN QUERY SELECT v_code, v_expires_at;
    RETURN;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_trip_otp(uuid, int) IS 'Generate or regenerate OTP for aggregate trip. Returns code and expires_at. O(1).';

-- Regenerate: same as generate (upsert clears used_at and sets new code). Exposed for UI "Regenerate" button.
CREATE OR REPLACE FUNCTION public.regenerate_trip_otp(
  p_trip_id uuid,
  p_ttl_minutes int DEFAULT 15
)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.generate_trip_otp(p_trip_id, p_ttl_minutes);
$$;

COMMENT ON FUNCTION public.regenerate_trip_otp(uuid, int) IS 'Regenerate OTP for trip; old code is invalidated. O(1).';

-- Get current OTP for display (only if not yet used). O(1) by trip_id.
CREATE OR REPLACE FUNCTION public.get_trip_otp(p_trip_id uuid)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT o.code, o.expires_at
  FROM public.trip_otps o
  WHERE o.trip_id = p_trip_id
    AND o.used_at IS NULL
    AND o.expires_at > now();
$$;

COMMENT ON FUNCTION public.get_trip_otp(uuid) IS 'Return current valid OTP for trip (for display/regenerate UI). O(1).';

-- Claim trip by OTP: validate, mark used, find/create driver for auth.uid(), set trip.driver_id. Race-safe. O(1).
-- Edge cases: expired/used/max attempts -> generic error; trip already claimed -> explicit error; concurrent claim -> one wins.
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
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- Lookup by code (O(1) via unique index). Single row or none.
  SELECT * INTO v_row FROM public.trip_otps WHERE trip_otps.code = trim(coalesce(p_code, '')) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired OTP');
  END IF;

  -- Already used -> generic message (replay; no increment)
  IF v_row.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired OTP');
  END IF;

  -- Expired -> increment failed_attempts and return
  IF v_row.expires_at <= now() THEN
    UPDATE public.trip_otps SET failed_attempts = failed_attempts + 1 WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired OTP');
  END IF;

  -- Too many failed attempts
  IF v_row.failed_attempts >= greatest(1, p_max_attempts) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many attempts. Ask for a new OTP.');
  END IF;

  -- Atomic mark-used: only one concurrent caller wins. O(1).
  UPDATE public.trip_otps
  SET used_at = now()
  WHERE id = v_row.id
    AND used_at IS NULL
    AND expires_at > now()
    AND failed_attempts < greatest(1, p_max_attempts)
  RETURNING trip_id INTO v_trip_id;

  IF v_trip_id IS NULL THEN
    -- Race: another request marked it used, or condition changed
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired OTP');
  END IF;

  -- Get trip org
  SELECT organization_id INTO v_org_id FROM public.trips WHERE id = v_trip_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trip not found');
  END IF;

  -- Find or create driver for this org and current user. O(1) by org + user_id.
  SELECT id, name INTO v_driver_id, v_driver_name
  FROM public.drivers
  WHERE organization_id = v_org_id AND user_id = v_uid
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    -- Create driver row linked to current user (name from profile or 'Driver')
    SELECT trim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''))
    INTO v_driver_name FROM auth.users WHERE id = v_uid;
    IF coalesce(v_driver_name, '') = '' THEN
      v_driver_name := 'Driver';
    END IF;
    INSERT INTO public.drivers (organization_id, user_id, name, phone, status)
    VALUES (v_org_id, v_uid, v_driver_name, NULL, 'offline')
    RETURNING id INTO v_driver_id;
  END IF;

  -- Assign trip to driver; only if not already assigned (trip already claimed by another).
  UPDATE public.trips
  SET driver_id = v_driver_id, updated_at = now()
  WHERE id = v_trip_id AND driver_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trip already claimed by another driver');
  END IF;

  -- Success: return trip payload for app (id, organization_id, etc.)
  RETURN jsonb_build_object(
    'ok', true,
    'trip_id', v_trip_id,
    'organization_id', v_org_id,
    'driver_id', v_driver_id
  );
END;
$$;

COMMENT ON FUNCTION public.claim_trip_by_otp(text, int) IS 'Claim aggregate trip by OTP: validate, mark used, find/create driver by auth.uid(), set trip.driver_id. Race-safe. O(1).';

-- Increment failed_attempts when wrong code is submitted (code exists but validation failed). Called from app before returning "Invalid or expired OTP" when we found a row but did not mark used.
CREATE OR REPLACE FUNCTION public.trip_otp_increment_failed(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trip_otps
  SET failed_attempts = failed_attempts + 1
  WHERE code = trim(coalesce(p_code, ''))
    AND used_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.trip_otp_increment_failed(text) IS 'Increment failed_attempts for wrong OTP submission. O(1).';

-- RLS: trip_otps readable by org members (trip belongs to org); claim_trip_by_otp is SECURITY DEFINER and uses auth.uid().
ALTER TABLE public.trip_otps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read trip_otps for their trips" ON public.trip_otps;
CREATE POLICY "Org members can read trip_otps for their trips"
  ON public.trip_otps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.organization_members om ON om.organization_id = t.organization_id AND om.user_id = auth.uid()
      WHERE t.id = trip_otps.trip_id
    )
  );

-- Generate/reget are called by app with trip_id (org member has access to trip). Claim is SECURITY DEFINER.
GRANT EXECUTE ON FUNCTION public.generate_trip_otp(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_trip_otp(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_otp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trip_by_otp(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_otp_increment_failed(text) TO authenticated;

-- Link phone to an existing driver row (post-OTP claim). Driver can only update own row (user_id = auth.uid()). O(1).
CREATE OR REPLACE FUNCTION public.link_driver_phone(p_driver_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_normalized text;
  v_updated int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_normalized := trim(regexp_replace(coalesce(p_phone, ''), '\s+', '', 'g'));
  IF v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Phone is required');
  END IF;

  UPDATE public.drivers
  SET phone = v_normalized, updated_at = now()
  WHERE id = p_driver_id AND user_id = v_uid;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Driver not found or access denied');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.link_driver_phone(uuid, text) IS 'Set phone on driver row (post-OTP claim). Caller must own the row (user_id = auth.uid()). O(1).';

GRANT EXECUTE ON FUNCTION public.link_driver_phone(uuid, text) TO authenticated;
