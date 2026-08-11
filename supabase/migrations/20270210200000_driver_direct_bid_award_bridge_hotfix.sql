-- Hotfix: accept_driver_direct_bid — correct 3 defects found by read-only
-- review of 20270210190000, which was applied to this database (by an
-- unrelated `db push` on the shared migrations directory sweeping up every
-- pending local-only file, not a deliberate push of this migration) before
-- the review's findings could be fixed. Confirmed via direct read-only
-- inspection before writing this file: driver_direct_bids had 0 accepted / 0
-- rejected rows and 0 trips had source_bid_id set, so the live defective
-- function was never actually exercised — this is a hotfix for a live but
-- so-far-unused exposure, not a data-repair migration.
--
-- 20270210190000 itself is intentionally left unmodified — Supabase already
-- considers that version applied, so editing its file would not cause it to
-- re-run. This migration is a new, separate, ordered CREATE OR REPLACE that
-- carries the same three fixes already made in that file's local copy.
--
-- Fixes, exactly the three found by review — nothing else changes:
-- 1) Idempotency: the trip lookup by source_bid_id now runs BEFORE the
--    pending-status guard, so a retry on an already-accepted bid returns the
--    existing trip instead of raising invalid_state (previously unreachable
--    dead code, since a successful accept always leaves status='accepted').
-- 2) Driver identity protection: a phone match is only linked to the bidder
--    when the matched row's user_id IS NULL. A phone match belonging to a
--    different, already-linked real user is no longer relinked — a separate
--    driver row is created for the bidder instead.
-- 3) Award concurrency: the parent posts row is now locked FOR UPDATE before
--    the "already awarded" checks, so two concurrent accepts on different
--    pending bids for the same post can no longer both succeed.
--
-- Unchanged: reject_driver_direct_bid, submit_driver_direct_bid,
-- trips.source_bid_id (already exists), driver_commission = bid amount,
-- frozen campaign snapshot, relationship_origin = 'phone_assignment',
-- authorization rules, Finance/UI, every other migration.
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
    INSERT INTO public.drivers (
      organization_id, name, phone, user_id, status, tracking_only,
      relationship_origin, relationship_status
    )
    VALUES (
      v_post.organization_id, v_driver_name, v_driver_phone, v_bid.driver_user_id,
      'offline', true, 'phone_assignment', 'independent'
    )
    RETURNING id INTO v_driver_id;
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

-- CREATE OR REPLACE preserves existing grants, but re-asserting them
-- explicitly avoids relying on that: this codebase has previously hit a
-- footgun where DROP+CREATE FUNCTION silently reset default PUBLIC execute
-- grants (see get_network_feed incident). This function was never dropped,
-- only replaced, so this is a defensive no-op here, not a required fix.
REVOKE ALL ON FUNCTION public.accept_driver_direct_bid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_driver_direct_bid(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_driver_direct_bid(uuid) IS
  'Accept a pending driver_direct_bids row and atomically create the trip: resolves/creates a same-org driver stub for the bidder (same convention as assign_aggregate_trip_driver, never relinking an already-claimed row), stamps driver_commission directly from the accepted bid amount, is idempotent by source_bid_id, and serializes same-post awards via a posts row lock. Caller must be a non-driver member of the org that owns the post.';
