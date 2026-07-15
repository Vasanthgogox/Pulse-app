-- Align trip OTP RPCs with assign_aggregate_trip_driver: allow both trip org (shipper)
-- and linked supplier org members to generate/read OTP. Fixes supplier "Access denied"
-- after successful assign-by-phone when regenerate_trip_otp runs.

BEGIN;

-- generate_trip_otp: same auth as assign_aggregate_trip_driver
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
  v_trip_org uuid;
  v_supplier_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.organization_id, t.supplier_id
  INTO v_trip_org, v_supplier_id
  FROM public.trips t
  WHERE t.id = p_trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF NOT (
    public.is_org_member(v_trip_org)
    OR (
      v_supplier_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.suppliers s
        WHERE s.id = v_supplier_id
          AND s.linked_organization_id IS NOT NULL
          AND public.is_org_member(s.linked_organization_id)
      )
    )
  ) THEN
    RAISE EXCEPTION 'Access denied for trip %', p_trip_id;
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
    RETURN QUERY SELECT v_code, v_expires_at;
    RETURN;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_trip_otp(uuid, int) IS
  'Generate or regenerate OTP for aggregate trip. Caller must be shipper org member or linked supplier org member (same scope as assign_aggregate_trip_driver).';

-- get_trip_otp: same auth so suppliers can display OTP in trip detail
CREATE OR REPLACE FUNCTION public.get_trip_otp(p_trip_id uuid)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_trip_org uuid;
  v_supplier_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.organization_id, t.supplier_id
  INTO v_trip_org, v_supplier_id
  FROM public.trips t
  WHERE t.id = p_trip_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT (
    public.is_org_member(v_trip_org)
    OR (
      v_supplier_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.suppliers s
        WHERE s.id = v_supplier_id
          AND s.linked_organization_id IS NOT NULL
          AND public.is_org_member(s.linked_organization_id)
      )
    )
  ) THEN
    RAISE EXCEPTION 'Access denied for trip %', p_trip_id;
  END IF;

  RETURN QUERY
  SELECT o.code, o.expires_at
  FROM public.trip_otps o
  WHERE o.trip_id = p_trip_id
    AND o.used_at IS NULL
    AND o.expires_at > now();
END;
$$;

COMMENT ON FUNCTION public.get_trip_otp(uuid) IS
  'Return current valid OTP for trip (display UI). Same caller scope as generate_trip_otp.';

-- RLS: allow linked supplier org to read trip_otps (aligns with assign_aggregate_trip_driver + get_trip_otp).
DROP POLICY IF EXISTS "Org members can read trip_otps for their trips" ON public.trip_otps;
CREATE POLICY "Org members can read trip_otps for their trips"
  ON public.trip_otps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      JOIN public.organization_members om
        ON om.organization_id = t.organization_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
      WHERE t.id = trip_otps.trip_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.trips t
      JOIN public.suppliers s ON s.id = t.supplier_id
      JOIN public.organization_members om
        ON om.organization_id = s.linked_organization_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
      WHERE t.id = trip_otps.trip_id
        AND t.supplier_id IS NOT NULL
        AND s.linked_organization_id IS NOT NULL
    )
  );

COMMIT;
