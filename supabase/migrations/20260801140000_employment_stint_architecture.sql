-- Employment Stint Architecture
--
-- Fixes a critical flaw where a driver rejoining a previous employer reused the
-- old drivers row and merged ledger history. Each reconnection is now a brand-new
-- row (a new "passbook"). Historical stints are preserved with left_at set.
--
-- Key changes:
--   1. drivers: add hired_at; drop full UNIQUE(org,phone); add partial uniques
--      (active phone, active user_id) so terminated stints don't block re-hire
--   2. driver_invites: drop full unique; add partial unique on pending only
--      so multiple historical invite rows can coexist per org+driver pair
--   3. accept_driver_invite: always INSERT new drivers row (with manual-driver
--      merge exception: unlinked phone-only rows are claimed rather than duplicated)
--   4. reopen_driver_invite: INSERT fresh pending row for accepted/rejected;
--      UPDATE pay terms for existing pending (prevents duplicate pending)
--   5. get_driver_invite_sent_status: deterministic order with pending first
--   6. New RPCs: get_active_driver_stint, get_driver_stint_history

-- ── 1. Add hired_at to drivers ──────────────────────────────────────────────

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS hired_at timestamptz NOT NULL DEFAULT now();

-- Backfill from created_at so existing rows reflect their actual hire date
UPDATE public.drivers
  SET hired_at = coalesce(created_at, now())
  WHERE hired_at = now();

COMMENT ON COLUMN public.drivers.hired_at IS
  'When this employment stint started. Each re-hire of the same driver creates a new row with a new hired_at.';

-- ── 2. Replace UNIQUE(organization_id, phone) on drivers ────────────────────

-- The original inline constraint prevents a second row for a driver who left and
-- rejoins with the same phone. Drop it and replace with partial uniques.
ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_organization_id_phone_key;

-- One active drivers row per (org, phone): terminated stints (left_at IS NOT NULL) are exempt
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_active_phone
  ON public.drivers(organization_id, phone)
  WHERE left_at IS NULL AND phone IS NOT NULL;

-- One active stint per (org, user_id): prevents double-accept of multiple invites
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_active_user
  ON public.drivers(organization_id, user_id)
  WHERE left_at IS NULL AND user_id IS NOT NULL;

-- ── 3. Replace full unique on driver_invites with pending-only partial ───────

-- The full unique blocked sending a second invite after an accepted/rejected one.
-- The partial unique still prevents duplicate pending invites (one at a time).
DROP INDEX IF EXISTS public.idx_driver_invites_from_to;

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_invites_pending_from_to
  ON public.driver_invites(from_organization_id, to_user_id)
  WHERE status = 'pending';

-- ── 4. Fix get_driver_invite_sent_status: deterministic with pending first ───

CREATE OR REPLACE FUNCTION public.get_driver_invite_sent_status(
  p_org_id    uuid,
  p_to_user_id uuid
)
RETURNS TABLE (status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT di.status
  FROM public.driver_invites di
  WHERE di.from_organization_id = p_org_id
    AND di.to_user_id = p_to_user_id
  ORDER BY
    (di.status = 'pending') DESC,  -- surface pending first if one exists
    di.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_invite_sent_status(uuid, uuid) TO authenticated;

-- ── 5. Rewrite accept_driver_invite: always INSERT new drivers row ───────────
--
-- Merge exception: when an org has a phone-only (manual / tracking_only) row
-- with no linked user_id that matches the driver's phone, we claim that row
-- (set user_id) instead of creating a duplicate. This is not a "rejoining"
-- scenario — it's the first real link for a manually-added roster entry.

CREATE OR REPLACE FUNCTION public.accept_driver_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- New employment stint: always INSERT a fresh drivers row (new passbook)
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
    RETURNING id INTO v_driver_id;
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
$$;

COMMENT ON FUNCTION public.accept_driver_invite(uuid) IS
  'Accept fleet invite. Merge exception: claims an unlinked phone-only roster entry if one exists. '
  'Otherwise always INSERTs a new drivers row (new employment stint / passbook). '
  'Guard raises if caller already has an active connection to the org.';

GRANT EXECUTE ON FUNCTION public.accept_driver_invite(uuid) TO authenticated;

-- ── 6. Update reopen_driver_invite: INSERT fresh row for non-pending cases ──
--
-- With the partial unique index, a new pending row can coexist alongside an
-- old accepted/rejected row. For the pending+pay-update case, UPDATE in place.

CREATE OR REPLACE FUNCTION public.reopen_driver_invite(
  p_org_id            uuid,
  p_to_user_id        uuid,
  p_from_org_name     text    DEFAULT NULL,
  p_invitee_name      text    DEFAULT NULL,
  p_payable_amount    numeric DEFAULT NULL,
  p_commission_percent numeric DEFAULT NULL,
  p_commission_per_km  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id              uuid;
  v_existing_status text;
  v_org_name        text;
  v_invitee         text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  -- Resolve org name fallback
  SELECT coalesce(nullif(trim(p_from_org_name), ''), o.name)
  INTO v_org_name
  FROM public.organizations o
  WHERE o.id = p_org_id;

  v_invitee := nullif(trim(coalesce(p_invitee_name, '')), '');

  -- Find the most-relevant existing invite (pending first, then latest)
  SELECT di.status INTO v_existing_status
  FROM public.driver_invites di
  WHERE di.from_organization_id = p_org_id
    AND di.to_user_id = p_to_user_id
  ORDER BY
    (di.status = 'pending') DESC,
    di.created_at DESC
  LIMIT 1;

  IF v_existing_status = 'pending' THEN
    -- Pending already exists: just update pay terms, leave status as pending
    UPDATE public.driver_invites di
    SET
      from_org_name      = coalesce(nullif(trim(v_org_name), ''), di.from_org_name),
      invitee_name       = coalesce(v_invitee, di.invitee_name),
      payable_amount     = p_payable_amount,
      commission_percent = p_commission_percent,
      commission_per_km  = p_commission_per_km
    WHERE di.from_organization_id = p_org_id
      AND di.to_user_id = p_to_user_id
      AND di.status = 'pending'
    RETURNING di.id INTO v_id;
  ELSE
    -- accepted / rejected / no prior row: INSERT a fresh pending invite
    INSERT INTO public.driver_invites (
      from_organization_id,
      to_user_id,
      status,
      from_org_name,
      invitee_name,
      payable_amount,
      commission_percent,
      commission_per_km
    )
    VALUES (
      p_org_id,
      p_to_user_id,
      'pending',
      v_org_name,
      v_invitee,
      p_payable_amount,
      p_commission_percent,
      p_commission_per_km
    )
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

COMMENT ON FUNCTION public.reopen_driver_invite(uuid, uuid, text, text, numeric, numeric, numeric) IS
  'Re-invite a driver for reconnect. Inserts a fresh pending row when prior invite is accepted/rejected. '
  'Updates pay terms in-place when a pending invite already exists.';

GRANT EXECUTE ON FUNCTION public.reopen_driver_invite(uuid, uuid, text, text, numeric, numeric, numeric) TO authenticated;

-- ── 7. Passbook helper RPCs ──────────────────────────────────────────────────

-- Active employment stint for this org+driver (left_at IS NULL)
CREATE OR REPLACE FUNCTION public.get_active_driver_stint(
  p_org_id  uuid,
  p_user_id uuid
)
RETURNS TABLE (
  id                 uuid,
  organization_id    uuid,
  user_id            uuid,
  name               text,
  phone              text,
  status             text,
  hired_at           timestamptz,
  payable_amount     numeric,
  commission_percent numeric,
  commission_per_km  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id, d.organization_id, d.user_id, d.name, d.phone, d.status,
    d.hired_at, d.payable_amount, d.commission_percent, d.commission_per_km
  FROM public.drivers d
  WHERE d.organization_id = p_org_id
    AND d.user_id = p_user_id
    AND d.left_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_driver_stint(uuid, uuid) TO authenticated;

-- All terminated stints for this org+driver (left_at IS NOT NULL), newest first
CREATE OR REPLACE FUNCTION public.get_driver_stint_history(
  p_org_id  uuid,
  p_user_id uuid
)
RETURNS TABLE (
  id                 uuid,
  organization_id    uuid,
  user_id            uuid,
  name               text,
  phone              text,
  hired_at           timestamptz,
  left_at            timestamptz,
  payable_amount     numeric,
  commission_percent numeric,
  commission_per_km  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id, d.organization_id, d.user_id, d.name, d.phone,
    d.hired_at, d.left_at,
    d.payable_amount, d.commission_percent, d.commission_per_km
  FROM public.drivers d
  WHERE d.organization_id = p_org_id
    AND d.user_id = p_user_id
    AND d.left_at IS NOT NULL
  ORDER BY d.hired_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_stint_history(uuid, uuid) TO authenticated;
