-- Driver relationship model — Phase 2, writer 2 of 3.
--
-- accept_driver_invite has two sub-paths that need different treatment:
--
--   1. Fresh INSERT (no prior row at all): a real employer invite was
--      accepted from a clean slate. relationship_origin='invite_accepted',
--      relationship_status='active_employee'.
--
--   2. Merge-exception UPDATE (claims an existing unlinked stub by phone):
--      relationship_status is set to 'active_employee', but
--      relationship_origin is NOT touched — it stays whatever it already was
--      (e.g. 'phone_assignment'). This is the case the whole relationship
--      model exists for: a row's provenance (how it was created) and its
--      current status (what it is now) are different questions, and this is
--      the proof that separating them works. relationship_origin describes
--      creation provenance only, never the latest event that happened to a
--      row.
--
-- The race-loss adoption branch is unchanged: it only links user_id onto a
-- row a concurrent transaction already fully inserted (with its own
-- relationship_origin/relationship_status already set), so it does not need
-- to set these fields again.
--
-- Body is otherwise byte-for-byte identical to the prior definition in
-- 20261207150000_fix_accept_driver_invite_race.sql. tracking_only and
-- drivers.user_id logic are unmodified.

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
      -- Claim the unlinked manual row: set user_id and apply invite pay terms.
      -- relationship_status becomes active_employee; relationship_origin is
      -- intentionally NOT set here — it stays whatever this row's provenance
      -- already was.
      UPDATE public.drivers
      SET user_id          = auth.uid(),
          name             = coalesce(nullif(trim(v_name), ''), name),
          email            = coalesce(nullif(trim(v_email), ''), email),
          tracking_only    = false,
          status           = 'offline',
          payable_amount   = coalesce(v_invite.payable_amount, payable_amount),
          commission_percent = coalesce(v_invite.commission_percent, commission_percent),
          commission_per_km  = coalesce(v_invite.commission_per_km, commission_per_km),
          relationship_status = 'active_employee',
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
        commission_per_km,
        relationship_origin,
        relationship_status
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
        v_invite.commission_per_km,
        'invite_accepted',
        'active_employee'
      )
      ON CONFLICT (organization_id, phone) WHERE (left_at IS NULL AND phone IS NOT NULL)
      DO NOTHING
      RETURNING id INTO v_driver_id;

      -- Lost the race: a concurrent txn created the active row first. Adopt it,
      -- linking to this user if still unlinked. That row's relationship_origin
      -- and relationship_status were already set by the winning transaction's
      -- own INSERT above, so this branch does not need to set them again.
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
