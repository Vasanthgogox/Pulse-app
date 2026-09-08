-- Phase 2, path 3: createDriver() ("Add driver directly", no invite).
--
-- The client-side version only checked for a LEFT driver in this org to
-- reconnect; otherwise it did a blind INSERT with user_id always NULL
-- (relationship_origin = 'manual_add' is always an unlinked placeholder by
-- design). It never checked for an ACTIVE same-org row either, so even a
-- same-org double-submit could 23505, on top of the cross-org collision.
--
-- This RPC preserves the reconnect-a-left-driver behavior exactly, adds a
-- same-org active-row idempotency check (new, strictly safer than today's
-- blind insert), and guards the cross-org case with the shared
-- lock_driver_phone() + ON CONFLICT DO NOTHING + lost-race fallback pattern.
--
-- Note: the reconnect check now matches via public.normalise_phone() (last
-- 10 digits) instead of the old client-side whitespace-only strip -- e.g.
-- "+91 98765 43210" now correctly reconnects to a left driver stored as
-- "9876543210", which the old comparison would have missed. This is a
-- deliberate, minor improvement consistent with normalization everywhere
-- else in this table, not an incidental side effect.

CREATE OR REPLACE FUNCTION public.create_driver_direct(
  p_org_id uuid,
  p_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_payable_amount numeric DEFAULT NULL,
  p_commission_percent numeric DEFAULT NULL,
  p_commission_per_km numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name        text := coalesce(nullif(trim(p_name), ''), '—');
  v_phone_norm  text := nullif(trim(coalesce(p_phone, '')), '');
  v_email       text := nullif(trim(coalesce(p_email, '')), '');
  v_last10      text;
  v_driver      public.drivers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  IF v_phone_norm IS NOT NULL THEN
    v_last10 := public.normalise_phone(v_phone_norm);
  END IF;

  -- Reconnect a LEFT driver in this org with the same phone (unchanged intent).
  IF v_last10 IS NOT NULL AND length(v_last10) >= 10 THEN
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE organization_id = p_org_id
      AND left_at IS NOT NULL
      AND phone IS NOT NULL
      AND public.normalise_phone(phone) = v_last10
    ORDER BY left_at DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.drivers
      SET name = v_name,
          phone = v_phone_norm,
          email = v_email,
          left_at = NULL,
          payable_amount = p_payable_amount,
          commission_percent = p_commission_percent,
          commission_per_km = p_commission_per_km,
          updated_at = now()
      WHERE id = v_driver.id
      RETURNING * INTO v_driver;
      RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', true);
    END IF;
  END IF;

  -- No usable phone: nothing can collide with the partial index. Insert directly.
  IF v_last10 IS NULL OR length(v_last10) < 10 THEN
    INSERT INTO public.drivers (
      organization_id, name, phone, email, status,
      payable_amount, commission_percent, commission_per_km,
      relationship_origin, relationship_status
    )
    VALUES (
      p_org_id, v_name, v_phone_norm, v_email, 'offline',
      p_payable_amount, p_commission_percent, p_commission_per_km,
      'manual_add', 'independent'
    )
    RETURNING * INTO v_driver;
    RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', false);
  END IF;

  PERFORM public.lock_driver_phone(v_last10);

  -- Re-check same-org ACTIVE row after lock: idempotent add, not a 23505.
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE organization_id = p_org_id
    AND left_at IS NULL
    AND phone_normalised = v_last10
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', false);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.phone_normalised = v_last10
      AND d.user_id IS NULL
      AND d.left_at IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before adding here.'
    );
  END IF;

  INSERT INTO public.drivers (
    organization_id, name, phone, email, status,
    payable_amount, commission_percent, commission_per_km,
    relationship_origin, relationship_status
  )
  VALUES (
    p_org_id, v_name, v_phone_norm, v_email, 'offline',
    p_payable_amount, p_commission_percent, p_commission_per_km,
    'manual_add', 'independent'
  )
  ON CONFLICT (phone_normalised) WHERE (phone_normalised IS NOT NULL AND user_id IS NULL AND left_at IS NULL)
  DO NOTHING
  RETURNING * INTO v_driver;

  IF v_driver.id IS NULL THEN
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE organization_id = p_org_id AND left_at IS NULL AND phone_normalised = v_last10
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before adding here.'
      );
    END IF;
    RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_driver_direct(uuid, text, text, text, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_driver_direct(uuid, text, text, text, numeric, numeric, numeric) TO authenticated;
