-- Driver Direct Bid — award bridge (backend only, no UI yet).
--
-- Closes the gap identified by read-only investigation: driver_direct_bids
-- has never had a writer for status transitions past 'pending', and nothing
-- converts an accepted bid into a real trip. This migration adds exactly
-- that — two decision RPCs plus a small, symmetric extension to the existing
-- submit_driver_direct_bid() eligibility check — reusing the same patterns
-- already shipped for award_indent_to_trip (trip creation) and
-- assign_aggregate_trip_driver (same-org driver stub resolution). No new
-- payment/allocation system, no structural schema change: drivers.organization_id
-- stays NOT NULL (the one genuinely additive piece here is a single nullable
-- trips.source_bid_id column, added below, for idempotency — see its own
-- comment). A Driver-cum-Owner is represented exactly the way
-- assign_aggregate_trip_driver already represents any phone-matched driver —
-- one stub row per (org, phone), scoped to whichever org is doing the
-- assigning. Accept + trip creation happen in one transaction (single
-- SECURITY DEFINER function body) so 'accepted' can never exist without a
-- corresponding trip.
--
-- driver_commission is stamped directly from the bid's own agreed amount —
-- a real, already-known number, not a guess. This does not reintroduce the
-- fabricated-10%-estimate bug fixed earlier: the amount here is exactly what
-- the driver bid and the shipper accepted, unrelated to
-- computeDriverCommissionForTrip()'s guess-removal fix, which still governs
-- every other read of this same column.
--
-- tracking_only=true / relationship_status='independent' on the resulting
-- driver stub mirrors assign_aggregate_trip_driver's own new-row convention
-- exactly (no formal employer relationship — a Driver-cum-Owner is
-- independent by definition). relationship_origin='phone_assignment' is the
-- closest existing value; there is no dedicated "direct_bid_award" origin in
-- the enum, and this migration does not add one — flagging that as an
-- open naming question for a future decision, not deciding it here.
--
-- Does NOT touch: computeDriverCommissionForTrip(), tripSettlement.util.ts,
-- TripsHubViews.tsx, TripPayableReceivableSummaryCard.tsx,
-- TripDetailFinanceView.tsx, stampTripDriverPayFromTerms(), any award UI,
-- drivers.organization_id, the existing marketplace bids table's own RPCs.

-- ── trips.source_bid_id — link back to the direct bid that created this trip ─
-- Needed for accept_driver_direct_bid's idempotency check below. Nullable,
-- additive, no default, no backfill — every existing trip gets NULL.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS source_bid_id uuid REFERENCES public.driver_direct_bids(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trips.source_bid_id IS
  'When this trip was created by accept_driver_direct_bid, the driver_direct_bids row that produced it. NULL for every other trip.';

-- ── reject_driver_direct_bid ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_driver_direct_bid(p_bid_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid public.driver_direct_bids;
  v_post_org_id uuid;
BEGIN
  SELECT * INTO v_bid FROM public.driver_direct_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  SELECT p.organization_id INTO v_post_org_id
  FROM public.posts p
  WHERE p.id = v_bid.post_id;
  IF v_post_org_id IS NULL THEN
    RAISE EXCEPTION 'not_found: post % for bid %', v_bid.post_id, p_bid_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_post_org_id AND om.user_id = (select auth.uid())
      AND om.status = 'active' AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the organization that owns this post';
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: bid already decided (current: %)', v_bid.status;
  END IF;

  UPDATE public.driver_direct_bids
  SET status = 'rejected', updated_at = now()
  WHERE id = p_bid_id;

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_driver_direct_bid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_driver_direct_bid(uuid) TO authenticated;

COMMENT ON FUNCTION public.reject_driver_direct_bid(uuid) IS
  'Reject a pending driver_direct_bids row. Caller must be a non-driver member of the org that owns the post. No trip is created.';

-- ── accept_driver_direct_bid ─────────────────────────────────────────────────
-- Atomic: decision + trip creation happen in the same function body/transaction
-- so 'accepted' can never exist without a corresponding trip.
CREATE OR REPLACE FUNCTION public.accept_driver_direct_bid(p_bid_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid              public.driver_direct_bids;
  v_post             public.posts;
  v_campaign         record;
  v_driver_phone     text;
  v_driver_name      text;
  v_last10           text;
  v_driver_id        uuid;
  v_matched_user_id  uuid;
  v_trip             public.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_bid FROM public.driver_direct_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  -- Lock the post for the duration of this decision. Two concurrent
  -- accept_driver_direct_bid calls for two different pending bids on the
  -- SAME post would otherwise each lock only their own (different) bid row
  -- and both pass the "already awarded" checks below before either commits,
  -- producing two accepted bids and two trips. Locking the shared post row
  -- serializes decisions for that post: the second caller blocks here until
  -- the first transaction commits or rolls back, then re-reads a post-commit
  -- view of the already-awarded checks.
  SELECT * INTO v_post FROM public.posts WHERE id = v_bid.post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: post % for bid %', v_bid.post_id, p_bid_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_post.organization_id AND om.user_id = (select auth.uid())
      AND om.status = 'active' AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the organization that owns this post';
  END IF;

  -- Idempotency: check this BEFORE the pending-status guard below. A
  -- successful accept always leaves the bid 'accepted' in the same
  -- transaction as the trip insert, so if the status check ran first, any
  -- retry (double submit, network retry) on an already-accepted bid would
  -- always fail that check before ever reaching this lookup — making the
  -- guard unreachable dead code. Checking first means a retry on a bid that
  -- already produced a trip returns that same trip instead of raising.
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.source = 'direct_bid' AND t.source_bid_id = v_bid.id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', v_bid.status);
  END IF;

  -- No trip yet for this bid — a decision (or a first-time accept) can only
  -- proceed from 'pending'. This still rejects double-accepting a bid that
  -- was somehow marked accepted without a trip (shouldn't happen, since
  -- accept+insert are atomic in this same function) and rejects re-deciding
  -- an already-rejected bid.
  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: bid already decided (current: %)', v_bid.status;
  END IF;

  -- Only one bid (direct or marketplace) may win a given load. Safe from the
  -- same-post race now that v_post is locked above.
  IF EXISTS (
    SELECT 1 FROM public.driver_direct_bids b2
    WHERE b2.post_id = v_bid.post_id AND b2.status = 'accepted' AND b2.id <> v_bid.id
  ) THEN
    RAISE EXCEPTION 'already_awarded: this load already has an accepted direct bid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bids b
    WHERE b.post_id = v_bid.post_id AND b.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'already_awarded: this load already has an accepted marketplace bid';
  END IF;

  -- Frozen campaign snapshot — same rate/route/vehicle the driver actually bid
  -- against, not whatever the live post might say now.
  SELECT rc.* INTO v_campaign
  FROM public.reach_campaigns rc
  WHERE rc.post_id = v_bid.post_id AND rc.status = 'active'
  ORDER BY rc.published_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no active campaign snapshot for post %', v_bid.post_id;
  END IF;

  -- Resolve the bidding driver's identity (already authenticated — not an
  -- OTP-pending stub like assign_aggregate_trip_driver's phone-match case).
  SELECT
    nullif(trim(coalesce(p.full_name, '')), ''),
    nullif(trim(coalesce(p.phone, '')), '')
  INTO v_driver_name, v_driver_phone
  FROM public.profiles p
  WHERE p.id = v_bid.driver_user_id;
  v_driver_name := coalesce(v_driver_name, 'Driver');
  v_last10 := right(regexp_replace(coalesce(v_driver_phone, ''), '\D', '', 'g'), 10);

  -- Same-org driver stub, resolved by phone or by this exact user_id if a row
  -- already exists — identical convention to assign_aggregate_trip_driver's
  -- own phone-match-or-create logic. One stub per (org, phone), not a single
  -- global driver identity; this is how a Driver-cum-Owner is represented
  -- under any given shipper org today, with no schema change.
  SELECT d.id, d.user_id INTO v_driver_id, v_matched_user_id
  FROM public.drivers d
  WHERE d.organization_id = v_post.organization_id
    AND (
      d.user_id = v_bid.driver_user_id
      OR (length(v_last10) = 10 AND d.phone_normalised = v_last10)
    )
  ORDER BY CASE WHEN d.user_id = v_bid.driver_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  -- A phone match is only safe to reuse when the matched row is unclaimed
  -- (user_id IS NULL) or already belongs to this exact bidder. If it belongs
  -- to a DIFFERENT real, already-linked user — a recycled number, a shared
  -- family phone, a data-entry duplicate — reusing it would silently
  -- reassign that other person's driver identity/history to this bidder.
  -- Treat that case as no match and create a separate row for the bidder
  -- below instead of hijacking the existing one.
  IF v_driver_id IS NOT NULL AND v_matched_user_id IS NOT NULL AND v_matched_user_id <> v_bid.driver_user_id THEN
    v_driver_id := NULL;
  END IF;

  IF v_driver_id IS NULL THEN
    -- idx_drivers_active_phone enforces one ACTIVE (left_at IS NULL) row per
    -- (organization_id, phone) — a pre-existing rule from the employment-stint
    -- work, unrelated to this migration. When the bidder's own phone is the
    -- exact number already claimed by the different active driver detected
    -- above, inserting with that phone would hit this constraint. ON CONFLICT
    -- DO NOTHING detects that case instead of letting it raise and abort the
    -- whole accept.
    INSERT INTO public.drivers (
      organization_id, name, phone, user_id, status, tracking_only,
      relationship_origin, relationship_status
    )
    VALUES (
      v_post.organization_id, v_driver_name, v_driver_phone, v_bid.driver_user_id,
      'offline', true, 'phone_assignment', 'independent'
    )
    ON CONFLICT (organization_id, phone) WHERE (left_at IS NULL AND phone IS NOT NULL)
    DO NOTHING
    RETURNING id INTO v_driver_id;

    IF v_driver_id IS NULL THEN
      -- Lost to the active-phone conflict: the phone is already claimed by
      -- the other, different active driver (never relinked above). Create
      -- the bidder's own row without claiming that phone number — we still
      -- know exactly who they are from their authenticated user_id, and not
      -- storing a phone that is already someone else's is more correct than
      -- failing the whole acceptance outright.
      INSERT INTO public.drivers (
        organization_id, name, phone, user_id, status, tracking_only,
        relationship_origin, relationship_status
      )
      VALUES (
        v_post.organization_id, v_driver_name, NULL, v_bid.driver_user_id,
        'offline', true, 'phone_assignment', 'independent'
      )
      RETURNING id INTO v_driver_id;
    END IF;
  ELSIF v_matched_user_id IS NULL THEN
    -- Existing stub matched by phone only (no user_id yet) — link it, since
    -- we now know exactly who this is from the authenticated bid itself.
    UPDATE public.drivers SET user_id = v_bid.driver_user_id, updated_at = now()
    WHERE id = v_driver_id;
  END IF;

  INSERT INTO public.trips (
    organization_id,
    trip_number,
    source,
    source_bid_id,
    pickup_area,
    drop_location,
    client_name,
    client_price,
    supplier_rate,
    supplier_id,
    trip_payout_mode,
    driver_id,
    status,
    pickup_date,
    load_type,
    platform_fee,
    driver_commission,
    payment_status,
    amount_paid
  ) VALUES (
    v_post.organization_id,
    '',
    'direct_bid',
    v_bid.id,
    coalesce(v_campaign.snapshot_origin, ''),
    coalesce(v_campaign.snapshot_destination, ''),
    '',
    coalesce(v_campaign.snapshot_rate_offer, 0),
    0,
    NULL,
    'asset',
    v_driver_id,
    'assigned',
    NULL,
    coalesce(v_campaign.snapshot_material, ''),
    0,
    v_bid.amount,
    'pending',
    0
  )
  RETURNING * INTO v_trip;

  UPDATE public.driver_direct_bids
  SET status = 'accepted', updated_at = now()
  WHERE id = p_bid_id;

  -- Only one direct bid may win this load — close out the rest.
  UPDATE public.driver_direct_bids
  SET status = 'rejected', updated_at = now()
  WHERE post_id = v_bid.post_id AND id <> v_bid.id AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$$;

REVOKE ALL ON FUNCTION public.accept_driver_direct_bid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_driver_direct_bid(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_driver_direct_bid(uuid) IS
  'Accept a pending driver_direct_bids row and atomically create the trip: resolves/creates a same-org driver stub for the bidder (same convention as assign_aggregate_trip_driver), stamps driver_commission directly from the accepted bid amount (a real, known figure, not an estimate), and rejects every other pending bid on the same post. Caller must be a non-driver member of the org that owns the post.';

-- ── submit_driver_direct_bid — symmetric "already awarded" check ────────────
-- Adds a driver_direct_bids-side check next to the existing marketplace-bids
-- one, so a new bid cannot be submitted once this load has an accepted direct
-- bid. Body is otherwise identical to the prior definition in
-- 20270210171000_fix_driver_direct_bid_biddable_and_counter.sql.
CREATE OR REPLACE FUNCTION public.submit_driver_direct_bid(
  p_post_id uuid,
  p_amount  numeric,
  p_note    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bid_id uuid;
  v_is_fo boolean := public.is_driver_fleet_owner(v_uid);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'driver')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = v_uid AND om.role = 'driver' AND om.status = 'active'
    )
    OR v_is_fo
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a driver';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- Match get_driver_reach_stories channel rules (no posts.is_active gate).
  IF NOT EXISTS (
    SELECT 1
    FROM public.reach_campaigns rc
    WHERE rc.post_id = p_post_id
      AND rc.status = 'active'
      AND (
        'driver' = ANY (rc.distribution_channels)
        OR (
          v_is_fo
          AND 'fleet' = ANY (rc.distribution_channels)
          AND upper(coalesce(rc.snapshot_post_type, '')) = 'LOAD'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.bids b
        WHERE b.post_id = rc.post_id
          AND b.status = 'accepted'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.driver_direct_bids ddb
        WHERE ddb.post_id = rc.post_id
          AND ddb.status = 'accepted'
      )
  ) THEN
    RAISE EXCEPTION 'not_biddable: post % is not an active story for this driver', p_post_id;
  END IF;

  INSERT INTO public.driver_direct_bids (post_id, driver_user_id, amount, note)
  VALUES (p_post_id, v_uid, p_amount, NULLIF(TRIM(COALESCE(p_note, '')), ''))
  ON CONFLICT (post_id, driver_user_id) DO UPDATE SET
    amount = EXCLUDED.amount,
    note = EXCLUDED.note,
    updated_at = now()
  WHERE public.driver_direct_bids.status = 'pending'
  RETURNING id INTO v_bid_id;

  IF v_bid_id IS NULL THEN
    RAISE EXCEPTION 'bid_locked: an existing decided bid cannot be changed';
  END IF;

  RETURN jsonb_build_object('bid_id', v_bid_id, 'post_id', p_post_id, 'amount', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) IS
  'Independent driver (incl. Fleet Owner) bids on an active Reach story. Biddability matches get_driver_reach_stories channel rules, and excludes posts already awarded via a marketplace bid or an accepted direct bid.';

