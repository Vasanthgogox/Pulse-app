-- Ensure invite acceptance merges into existing manual driver rows instead of creating duplicates.
-- Matching priority:
--   1) org + user_id (strong identity)
--   2) org + canonical phone last-10 (fallback for manual rows with user_id null)
-- Conflict policy:
--   - keep existing driver row id
--   - invite compensation terms take precedence when provided
--   - signed-up profile/contact values fill missing roster fields

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
  v_phone_last10 text;
BEGIN
  SELECT *
  INTO v_invite
  FROM public.driver_invites
  WHERE id = p_invite_id
    AND to_user_id = auth.uid()
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already responded';
  END IF;

  SELECT
    coalesce(
      nullif(trim(p.full_name), ''),
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      'Driver'
    ),
    nullif(trim(coalesce(p.phone, u.raw_user_meta_data->>'phone')), ''),
    nullif(trim(coalesce(p.email, u.email)), '')
  INTO v_name, v_phone, v_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();

  v_phone_last10 := public.normalize_phone_last10(v_phone);

  -- Try to reuse existing driver row in this org.
  SELECT d.id
  INTO v_driver_id
  FROM public.drivers d
  WHERE d.organization_id = v_invite.from_organization_id
    AND (
      d.user_id = auth.uid()
      OR (
        length(v_phone_last10) = 10
        AND d.phone IS NOT NULL
        AND public.normalize_phone_last10(d.phone) = v_phone_last10
      )
    )
  ORDER BY
    (d.user_id = auth.uid()) DESC,
    (d.left_at IS NULL) DESC,
    d.updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_driver_id IS NOT NULL THEN
    UPDATE public.drivers
    SET user_id = auth.uid(),
        name = coalesce(nullif(trim(v_name), ''), name),
        phone = coalesce(nullif(trim(v_phone), ''), phone),
        email = coalesce(nullif(trim(v_email), ''), email),
        left_at = null,
        tracking_only = false,
        status = 'offline',
        payable_amount = coalesce(v_invite.payable_amount, payable_amount),
        commission_percent = coalesce(v_invite.commission_percent, commission_percent),
        commission_per_km = coalesce(v_invite.commission_per_km, commission_per_km),
        updated_at = now()
    WHERE id = v_driver_id;
  ELSE
    BEGIN
      INSERT INTO public.drivers (
        organization_id,
        name,
        phone,
        email,
        user_id,
        status,
        tracking_only,
        payable_amount,
        commission_percent,
        commission_per_km
      )
      VALUES (
        v_invite.from_organization_id,
        coalesce(nullif(trim(v_name), ''), 'Driver'),
        v_phone,
        v_email,
        auth.uid(),
        'offline',
        false,
        v_invite.payable_amount,
        v_invite.commission_percent,
        v_invite.commission_per_km
      )
      RETURNING id INTO v_driver_id;
    EXCEPTION
      WHEN unique_violation THEN
        -- Race-safe retry: another transaction inserted a row for same person/org.
        SELECT d.id
        INTO v_driver_id
        FROM public.drivers d
        WHERE d.organization_id = v_invite.from_organization_id
          AND (
            d.user_id = auth.uid()
            OR (
              length(v_phone_last10) = 10
              AND d.phone IS NOT NULL
              AND public.normalize_phone_last10(d.phone) = v_phone_last10
            )
          )
        ORDER BY
          (d.user_id = auth.uid()) DESC,
          (d.left_at IS NULL) DESC,
          d.updated_at DESC
        LIMIT 1;

        IF v_driver_id IS NULL THEN
          RAISE;
        END IF;

        UPDATE public.drivers
        SET user_id = auth.uid(),
            name = coalesce(nullif(trim(v_name), ''), name),
            phone = coalesce(nullif(trim(v_phone), ''), phone),
            email = coalesce(nullif(trim(v_email), ''), email),
            left_at = null,
            tracking_only = false,
            status = 'offline',
            payable_amount = coalesce(v_invite.payable_amount, payable_amount),
            commission_percent = coalesce(v_invite.commission_percent, commission_percent),
            commission_per_km = coalesce(v_invite.commission_per_km, commission_per_km),
            updated_at = now()
        WHERE id = v_driver_id;
    END;
  END IF;

  UPDATE public.driver_invites
  SET status = 'accepted',
      responded_at = now(),
      responded_by = auth.uid()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'driver_id', v_driver_id,
    'organization_id', v_invite.from_organization_id
  );
END;
$$;

COMMENT ON FUNCTION public.accept_driver_invite(uuid) IS
'Accept fleet invite by reusing existing manual driver row when possible (org+user first, then canonical phone last-10); inserts only when no match exists.';
