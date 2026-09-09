-- Phase 2, path 4: ensureDriverRowByPhone() tail insert.
--
-- All three "find existing" branches in the TS function (forceUnlinkedForOtp,
-- trackingOnly-only, default) are pure reads and stay in TS unchanged -- they
-- are not racy. Only the shared tail INSERT (reached when none of the three
-- branches found a row) is at risk, and only when it resolves user_id to
-- NULL: trackingOnly always forces NULL; the default branch does too when no
-- platform-user match exists. This RPC takes the exact values the TS layer
-- already resolved (name, phone, user_id, tracking_only, commission_percent)
-- so no business logic moves server-side -- only the "create it" step
-- becomes atomic.

CREATE OR REPLACE FUNCTION public.ensure_driver_row_by_phone_insert(
  p_org_id uuid,
  p_name text,
  p_phone text,
  p_user_id uuid,
  p_tracking_only boolean,
  p_commission_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone_norm text := nullif(trim(coalesce(p_phone, '')), '');
  v_last10     text;
  v_driver     public.drivers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;
  IF v_phone_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Phone is required');
  END IF;
  v_last10 := public.normalise_phone(v_phone_norm);

  -- Only the user_id IS NULL path can ever hit idx_drivers_phone_normalised.
  IF p_user_id IS NULL AND length(coalesce(v_last10, '')) >= 10 THEN
    PERFORM public.lock_driver_phone(v_last10);

    -- Re-check same org after lock (mirrors the TS caller's own pre-check,
    -- closes the window between its read and this insert).
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE organization_id = p_org_id
      AND left_at IS NULL
      AND (phone = v_phone_norm OR phone_normalised = v_last10)
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver));
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.phone_normalised = v_last10 AND d.user_id IS NULL AND d.left_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before assigning here.'
      );
    END IF;
  END IF;

  INSERT INTO public.drivers (
    organization_id, name, phone, user_id, status, tracking_only,
    relationship_origin, relationship_status, commission_percent
  )
  VALUES (
    p_org_id,
    coalesce(nullif(trim(p_name), ''), 'Driver'),
    v_phone_norm,
    p_user_id,
    'offline',
    coalesce(p_tracking_only, false),
    'phone_assignment',
    'independent',
    CASE WHEN coalesce(p_commission_percent, 0) > 0 THEN p_commission_percent ELSE NULL END
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
        'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before assigning here.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver));
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_driver_row_by_phone_insert(uuid, text, text, uuid, boolean, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_driver_row_by_phone_insert(uuid, text, text, uuid, boolean, numeric) TO authenticated;
