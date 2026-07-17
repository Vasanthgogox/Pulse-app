-- Fix driver-signup race: concurrent accept_driver_invite calls for the same
-- (organization_id, phone) both fell through the check-then-insert gap and the
-- second INSERT violated the partial unique index
--   idx_drivers_active_phone UNIQUE (organization_id, phone) WHERE (left_at IS NULL AND phone IS NOT NULL)
-- surfacing as a raw 23505 duplicate-key 500 (log noise + failed accept).
--
-- Fixes, in order:
--   1. pg_advisory_xact_lock on hash(org_id || ':' || phone_last10) so concurrent
--      accepts for the same phone in the same org serialize instead of racing.
--   2. Idempotent re-check after the lock: if the caller already has an active
--      linked driver row in this org (a duplicate accept that already succeeded),
--      return it rather than inserting again.
--   3. INSERT guarded with ON CONFLICT ... DO NOTHING; if a concurrent txn won the
--      race, adopt the existing active row and link it to this user.
--
-- Multi-stint model preserved: rows with left_at set are NOT reused/reconnected;
-- a genuinely new stint still gets a fresh drivers row (new passbook).

CREATE OR REPLACE FUNCTION public.accept_driver_invite(p_invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite       public.driver_invites;
  v_driver_id    uuid;
  v_name         text;
  v_phone        text;
  v_email        text;
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

  -- Guard: block if caller already has an active connection to this org
  IF EXISTS (
    SELECT 1 FROM public.drivers
    WHERE organization_id = v_invite.from_organization_id
      AND user_id = auth.uid()
      AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Already connected to this organization. Leave first before re-joining.';
  END IF;

  -- Resolve caller identity from profiles + auth.users
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

  -- (1) Serialize concurrent accepts for the same (org, phone) so the
  -- check-then-insert below cannot race into a duplicate-key violation.
  IF length(coalesce(v_phone_last10, '')) = 10 THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_invite.from_organization_id::text || ':' || v_phone_last10, 0)
    );
  END IF;

  -- (2) Idempotency: if the caller already has an active linked row in this org
  -- (e.g. a duplicate accept that already committed under the lock), return it.
  SELECT id
  INTO v_driver_id
  FROM public.drivers
  WHERE organization_id = v_invite.from_organization_id
    AND user_id = auth.uid()
    AND left_at IS NULL
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    -- Merge exception: claim an unlinked (manual / tracking-only) roster entry
    -- that was added by phone before this driver had a Pulse account.
    -- Only applies when: user_id IS NULL, left_at IS NULL, phone matches.
    IF length(v_phone_last10) = 10 THEN
      SELECT d.id
      INTO v_driver_id
      FROM public.drivers d
      WHERE d.organization_id = v_invite.from_organization_id
        AND d.user_id IS NULL
        AND d.left_at IS NULL
        AND d.phone IS NOT NULL
        AND public.normalize_phone_last10(d.phone) = v_phone_last10
      ORDER BY d.updated_at DESC
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_driver_id IS NOT NULL THEN
      -- Claim the unlinked manual row: set user_id and apply invite pay terms
      UPDATE public.drivers
      SET user_id          = auth.uid(),
          name             = coalesce(nullif(trim(v_name), ''), name),
          email            = coalesce(nullif(trim(v_email), ''), email),
          tracking_only    = false,
          status           = 'offline',
          payable_amount   = coalesce(v_invite.payable_amount, payable_amount),
          commission_percent = coalesce(v_invite.commission_percent, commission_percent),
          commission_per_km  = coalesce(v_invite.commission_per_km, commission_per_km),
          updated_at       = now()
      WHERE id = v_driver_id;
    ELSE
      -- New employment stint: always INSERT a fresh drivers row (new passbook).
      -- (3) Guard against a concurrent insert of the same active (org, phone).
      INSERT INTO public.drivers (
        organization_id,
        name,
        phone,
        email,
        user_id,
        status,
        tracking_only,
        hired_at,
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
        now(),
        v_invite.payable_amount,
        v_invite.commission_percent,
        v_invite.commission_per_km
      )
      ON CONFLICT (organization_id, phone) WHERE (left_at IS NULL AND phone IS NOT NULL)
      DO NOTHING
      RETURNING id INTO v_driver_id;

      -- Lost the race: a concurrent txn created the active row first. Adopt it,
      -- linking to this user if still unlinked.
      IF v_driver_id IS NULL THEN
        SELECT id
        INTO v_driver_id
        FROM public.drivers
        WHERE organization_id = v_invite.from_organization_id
          AND phone = v_phone
          AND left_at IS NULL
        LIMIT 1;

        UPDATE public.drivers
        SET user_id    = auth.uid(),
            updated_at = now()
        WHERE id = v_driver_id
          AND user_id IS NULL;
      END IF;
    END IF;
  END IF;

  UPDATE public.driver_invites
  SET status       = 'accepted',
      responded_at = now(),
      responded_by = auth.uid()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'driver_id',       v_driver_id,
    'organization_id', v_invite.from_organization_id
  );
END;
$function$;
