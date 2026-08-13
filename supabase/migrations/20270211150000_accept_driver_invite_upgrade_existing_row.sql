-- Let a fleet invite upgrade an existing roster row instead of being refused.
--
-- REPORTED
-- "Unable to accept invitation. (Driver app). Decline is working."
--
-- ROOT CAUSE
-- accept_driver_invite refused with 'Already connected to this organization.
-- Leave first before re-joining.' whenever the caller already had an active
-- drivers row in the inviting org. Driver Ajithkumar
-- (user 76b2ade1-6996-41d5-985e-08066c1ce590) hit this on BOTH his invites:
-- ITS Logistics Company at 8% (invite 2e4d4095) and idreeslogistics at 15%
-- (invite 54d25864). ITS had added him via manual_add on 2026-08-12 11:15 —
-- one day BEFORE sending the formal invite — so drivers row 420a67ae already
-- existed with left_at IS NULL and his user_id set.
--
-- The function already had a merge-exception branch for precisely this case,
-- but it only claims rows WHERE user_id IS NULL, so an already-linked roster
-- row could never absorb an invite. Guard 1 fired before it anyway.
--
-- The guard was written to prevent duplicate employment stints (re-joining
-- without leaving). It did not distinguish that from upgrading an existing
-- manual_add / phone_assignment stub to invited terms — a normal flow: the
-- fleet adds a driver by phone to run a trip, then formalises the relationship
-- with an invite carrying agreed pay terms.
--
-- CONSEQUENCE BEYOND THE BLOCKED BUTTON
-- Accept is the only path that writes the invite's commission_percent onto the
-- driver row. Blocking it means the agreed percentage is never stored, making
-- this a live upstream cause of the Rs.0 driver payouts addressed downstream in
-- 3d703fec. Fixing it here fixes the payout at its source.
--
-- MEASURED SCOPE (read-only, pre-apply)
--   pending invites blocked right now ........ 0 (no pending invites exist)
--   invites ever accepted .................... 8, of which 0 would hit Guard 1
--   invites ever rejected .................... 2, of which 2 DID hit Guard 1
-- Every invite that has ever hit this bug is one of Ajithkumar's two. The clean
-- split (all accepts unblocked, all rejects blocked) is strong evidence Guard 1
-- is what turned both into rejections.
--
-- FIX
-- Replace the hard refusal with an upgrade: if the caller already has an active
-- row in this org, apply the invite's pay terms, clear tracking_only, set
-- relationship_status = 'active_employee', then fall through to the normal
-- accepted-status update and return the same JSON shape the client expects.
--
-- PRESERVED SEMANTICS
--   * Invite must still be pending and addressed to auth.uid() (FOR UPDATE).
--   * Advisory lock, idempotency lookup, unlinked-row merge, insert-race
--     adoption and the ON CONFLICT guard are all unchanged.
--   * relationship_origin is NEVER rewritten on an existing row — it is
--     write-once provenance (see docs/DRIVER_TRIP_COMPENSATION_MODEL.md). Only
--     relationship_status and pay terms change.
--   * coalesce() on each pay term means an invite with a NULL field does not
--     erase terms already agreed on the row.
--   * SECURITY DEFINER, search_path and the jsonb return shape are unchanged,
--     so acceptDriverInvite's { driver_id, organization_id } parsing still works.
--   * FOR UPDATE added to the existing-row SELECT so a concurrent accept cannot
--     interleave between the read and the UPDATE.
--
-- BEHAVIOUR CHANGE
-- Re-joining an org you are still actively linked to no longer errors; it
-- refreshes your terms instead. That is the intended product behaviour — the
-- previous message told drivers to "leave first", which would have destroyed
-- their passbook history for no reason.

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

  -- (2) Already on this org's roster? Upgrade that row instead of refusing.
  -- This branch previously RAISEd 'Already connected to this organization',
  -- which blocked every manual_add / phone_assignment driver from ever
  -- accepting their own fleet's invite. It also doubles as the idempotency
  -- path for a duplicate accept that already committed under the lock.
  SELECT id
  INTO v_driver_id
  FROM public.drivers
  WHERE organization_id = v_invite.from_organization_id
    AND user_id = auth.uid()
    AND left_at IS NULL
  LIMIT 1
  FOR UPDATE;

  IF v_driver_id IS NOT NULL THEN
    UPDATE public.drivers
       SET name               = coalesce(nullif(trim(v_name), ''), name),
           email              = coalesce(nullif(trim(v_email), ''), email),
           tracking_only      = false,
           payable_amount     = coalesce(v_invite.payable_amount, payable_amount),
           commission_percent = coalesce(v_invite.commission_percent, commission_percent),
           commission_per_km  = coalesce(v_invite.commission_per_km, commission_per_km),
           -- relationship_origin deliberately NOT touched: write-once provenance.
           relationship_status = 'active_employee',
           updated_at         = now()
     WHERE id = v_driver_id;
  END IF;

  IF v_driver_id IS NULL THEN
    -- Merge exception: claim an unlinked (manual / tracking-only) roster entry
    -- that was added by phone before this driver had a Pulse account.
    -- Only applies when: user_id IS NULL, left_at IS NULL, phone matches.
    IF length(coalesce(v_phone_last10, '')) = 10 THEN
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
