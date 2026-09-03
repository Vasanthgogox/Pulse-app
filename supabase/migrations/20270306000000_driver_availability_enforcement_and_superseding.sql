-- A6.3 — Driver Availability Enforcement & Cross-Bid Superseding.
--
-- Implements the approved A6.2 design: a driver with a non-terminal trip is
-- "unavailable" and cannot submit or be awarded another Market/Reach bid;
-- when an award creates a trip, every other pending bid the same driver
-- holds -- across BOTH market_bids and driver_direct_bids, regardless of
-- which mechanism caused the award -- transitions to a new 'superseded'
-- status in the SAME transaction as the trip insert. Does not touch
-- enforce_single_active_trip_per_driver(), which remains the final DB
-- backstop unchanged.

-- ---------------------------------------------------------------------
-- 1. is_driver_available(p_user_id) -- the single authoritative check.
--
-- Reused by all four call sites below (submit_market_bid,
-- submit_driver_direct_bid, accept_market_bid, accept_driver_direct_bid) --
-- do not reimplement this logic anywhere else.
--
-- IDENTITY RESOLUTION (read this before changing anything here):
-- trips.driver_id references drivers(id), an org-scoped row -- NOT
-- profiles(id)/auth.uid() directly. A single person (one profiles row, one
-- auth.uid()) can have MULTIPLE drivers rows, one per organization they've
-- worked with (drivers.user_id links each such row back to that one
-- profiles.id). market_bids.bidder_user_id and driver_direct_bids.
-- driver_user_id are always the auth.uid()/profiles.id, never a drivers.id.
--
-- A naive `profiles.id = trips.driver_id` comparison will silently never
-- match anything (wrong id space, no error) -- confirmed the hard way while
-- auditing this. Do not reintroduce that mistake.
--
-- This function therefore checks two independent things, mirroring
-- enforce_single_active_trip_per_driver()'s own two checks
-- (driver_has_other_active_trip + driver_phone_has_other_active_trip) but
-- keyed by the bidder's profiles.id instead of a single known drivers.id,
-- since at bid-submission/pre-award time we don't yet know which drivers
-- row (if any) a future trip would use:
--   a) any drivers row already linked to this person (d.user_id = p_user_id)
--      has a non-terminal trip, across ANY organization: OR
--   b) any non-terminal trip's driver has the same phone (last 10 digits,
--      non-digits stripped) as this person's own profiles.phone -- the same
--      phone-global dedup the trigger already performs, anchored on the
--      caller's profile phone rather than a specific drivers row's phone.
CREATE FUNCTION public.is_driver_available(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.drivers d ON d.id = t.driver_id
    WHERE lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'cancelled', 'done', 'delivered')
      AND (
        d.user_id = p_user_id
        OR (
          right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) <> ''
          AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = (
            SELECT right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10)
            FROM public.profiles p
            WHERE p.id = p_user_id
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_driver_available(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_driver_available(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_driver_available(uuid) IS
  'A6.3: single authoritative driver-availability check, reused by submit_market_bid, submit_driver_direct_bid, accept_market_bid, and accept_driver_direct_bid. See in-file header comment for the drivers-vs-profiles identity resolution -- do not reimplement this logic elsewhere.';

-- ---------------------------------------------------------------------
-- 2. Widen both bid-status CHECK constraints to allow 'superseded'.
ALTER TABLE public.market_bids DROP CONSTRAINT market_bids_status_check;
ALTER TABLE public.market_bids ADD CONSTRAINT market_bids_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text, 'superseded'::text]));

ALTER TABLE public.driver_direct_bids DROP CONSTRAINT driver_direct_bids_status_check;
ALTER TABLE public.driver_direct_bids ADD CONSTRAINT driver_direct_bids_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text, 'superseded'::text]));

-- ---------------------------------------------------------------------
-- 3. submit_market_bid() -- block an unavailable DCO bidder. Organization
-- bidders are unaffected (no individual driver/trip involved on that path).
CREATE OR REPLACE FUNCTION public.submit_market_bid(p_indent_id uuid, p_amount numeric, p_note text DEFAULT NULL::text, p_bidder_organization_id uuid DEFAULT NULL::uuid, p_owner_vehicle_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_bidder_type text;
  v_bid_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF NOT public.indent_open_for_marketplace_bids(p_indent_id) THEN
    RAISE EXCEPTION 'not_biddable: indent % is not open for marketplace bids', p_indent_id;
  END IF;

  -- p_bidder_organization_id NULL => DCO path. Set => Business path.
  IF p_bidder_organization_id IS NULL THEN
    v_bidder_type := 'dco';

    IF NOT public.is_driver_fleet_owner(v_uid) THEN
      RAISE EXCEPTION 'unauthorized: Fleet Owner capability required for a DCO bid';
    END IF;

    -- A6.3: a driver with a non-terminal trip cannot submit (or revise) a
    -- Market bid until that trip completes.
    IF NOT public.is_driver_available(v_uid) THEN
      RAISE EXCEPTION 'driver_unavailable: you are on an active trip -- complete it before bidding on another load';
    END IF;

    IF p_owner_vehicle_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.owner_vehicles ov
      WHERE ov.id = p_owner_vehicle_id
        AND ov.owner_user_id = v_uid
        AND ov.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'owner_vehicle_id must belong to the caller''s own fleet';
    END IF;
  ELSE
    v_bidder_type := 'organization';

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_bidder_organization_id
        AND om.user_id = v_uid
        AND om.status = 'active'
    ) THEN
      RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.indents i
      WHERE i.id = p_indent_id AND i.organization_id = p_bidder_organization_id
    ) THEN
      RAISE EXCEPTION 'cannot bid on your own organization''s indent';
    END IF;
  END IF;

  INSERT INTO public.market_bids (
    indent_id, bidder_type, bidder_user_id, bidder_organization_id, owner_vehicle_id, amount, note
  )
  VALUES (
    p_indent_id, v_bidder_type, v_uid, p_bidder_organization_id, p_owner_vehicle_id, p_amount,
    NULLIF(TRIM(COALESCE(p_note, '')), '')
  )
  ON CONFLICT (indent_id, bidder_user_id) DO UPDATE SET
    amount = EXCLUDED.amount,
    note = EXCLUDED.note,
    owner_vehicle_id = EXCLUDED.owner_vehicle_id,
    updated_at = now()
  WHERE public.market_bids.status = 'pending'
  RETURNING id INTO v_bid_id;

  IF v_bid_id IS NULL THEN
    RAISE EXCEPTION 'bid_locked: an existing decided bid cannot be changed';
  END IF;

  RETURN jsonb_build_object(
    'bid_id', v_bid_id, 'indent_id', p_indent_id, 'bidder_type', v_bidder_type, 'amount', p_amount
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. submit_driver_direct_bid() -- same availability gate for Reach.
CREATE OR REPLACE FUNCTION public.submit_driver_direct_bid(p_post_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- A6.3: same availability gate as submit_market_bid, mirrored here for Reach.
  IF NOT public.is_driver_available(v_uid) THEN
    RAISE EXCEPTION 'driver_unavailable: you are on an active trip -- complete it before bidding on another load';
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
$function$;

-- ---------------------------------------------------------------------
-- 5. accept_market_bid() -- early availability pre-check on the DCO branch
-- (organization branch untouched, no driver/trip involved there), plus
-- cross-mechanism superseding of the driver's other pending bids, in the
-- same transaction as the trip insert.
CREATE OR REPLACE FUNCTION public.accept_market_bid(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_bid       public.market_bids;
  v_indent    public.indents;
  v_driver_id uuid;
  v_trip      public.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_bid FROM public.market_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  -- Lock the INDENT first -- the concurrency rule locked for this contract.
  -- Any concurrent award attempt on this same indent (another market_bids
  -- row, a driver_direct_bids accept via an indent-linked post, or an
  -- org-to-org award RPC) serializes on this same row lock.
  SELECT * INTO v_indent FROM public.indents WHERE id = v_bid.indent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: indent % for bid %', v_bid.indent_id, p_bid_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_indent.organization_id
      AND om.user_id = (select auth.uid())
      AND om.status = 'active'
      AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the organization that owns this indent';
  END IF;

  -- Idempotency 1: a trip already exists for this bid (DCO path always,
  -- organization path once allocation/Phase 3 has run).
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.source = 'market_bid' AND t.source_market_bid_id = v_bid.id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', v_bid.status);
  END IF;

  -- Idempotency 2: organization award already accepted, no trip yet (the
  -- normal, expected state between accept and allocation).
  IF v_bid.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', NULL, 'status', 'accepted');
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: bid already decided (current: %)', v_bid.status;
  END IF;

  IF lower(trim(coalesce(v_indent.status, ''))) NOT IN ('open', 'broadcast') THEN
    RAISE EXCEPTION 'indent_not_open: indent % is not open for award (status=%)', v_indent.id, v_indent.status;
  END IF;

  -- At most one non-cancelled canonical trip per indent -- the same guard
  -- release_and_reopen_indent() uses, backstopped by the narrowed
  -- trips_one_per_indent unique index.
  IF EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.indent_id = v_indent.id AND t.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'already_awarded: indent % already has an active canonical trip', v_indent.id;
  END IF;

  IF v_bid.bidder_type = 'organization' THEN
    IF v_bid.bidder_organization_id IS NULL THEN
      RAISE EXCEPTION 'invalid_bid: organization bid % has no bidder_organization_id', v_bid.id;
    END IF;

    UPDATE public.market_bids
    SET status = 'accepted', accepted_at = now(), updated_at = now()
    WHERE id = p_bid_id;

    -- Only one bid may win this indent -- same rule as the DCO path.
    UPDATE public.market_bids
    SET status = 'rejected', updated_at = now()
    WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

    UPDATE public.indents
    SET status = 'awarded',
        assigned_supplier_id = v_bid.bidder_organization_id,
        updated_at = now()
    WHERE id = v_indent.id;

    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', NULL, 'status', 'accepted');
  END IF;

  IF v_bid.bidder_type <> 'dco' THEN
    RAISE EXCEPTION 'unexpected_bidder_type: %', v_bid.bidder_type;
  END IF;

  -- A6.3: clean pre-check before attempting the trip insert, so a business
  -- gets a real error instead of enforce_single_active_trip_per_driver()'s
  -- raw trigger exception. The trigger itself is unchanged and remains the
  -- final backstop.
  IF NOT public.is_driver_available(v_bid.bidder_user_id) THEN
    RAISE EXCEPTION 'driver_unavailable: this driver is already on an active trip';
  END IF;

  -- H4 (Gate 4 hardening): the vehicle was valid when the bid was submitted,
  -- but acceptance is the moment it becomes part of a real Trip -- revalidate
  -- rather than trust a snapshot that may be stale by the time of award.
  -- Same check submit_market_bid already performs at submission time
  -- (ownership + not soft-deleted); acceptance re-checks the same two
  -- things, not a new, stricter bar.
  IF v_bid.owner_vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.owner_vehicles ov
    WHERE ov.id = v_bid.owner_vehicle_id
      AND ov.owner_user_id = v_bid.bidder_user_id
      AND ov.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'vehicle_no_longer_eligible: owner_vehicle % is no longer valid for bidder %', v_bid.owner_vehicle_id, v_bid.bidder_user_id;
  END IF;

  v_driver_id := public._resolve_or_create_market_driver(v_indent.organization_id, v_bid.bidder_user_id);

  INSERT INTO public.trips (
    organization_id,
    trip_number,
    source,
    source_market_bid_id,
    indent_id,
    owner_vehicle_id,
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
    v_indent.organization_id,
    '',
    'market_bid',
    v_bid.id,
    v_indent.id,
    v_bid.owner_vehicle_id,
    coalesce(v_indent.pickup_area, ''),
    coalesce(v_indent.drop_location, ''),
    coalesce(v_indent.client_name, ''),
    v_bid.amount,
    0,
    NULL,
    'asset',
    v_driver_id,
    'assigned',
    v_indent.pickup_date,
    coalesce(v_indent.load_type, ''),
    0,
    v_bid.amount,
    'pending',
    0
  )
  RETURNING * INTO v_trip;

  UPDATE public.market_bids
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = p_bid_id;

  -- Only one bid may win this indent -- close out the rest, across the
  -- market_bids table itself. Pending bids/driver_direct_bids on any
  -- indent-linked LOAD post are already handled by the terminal-status
  -- trigger fired by the indents.status update below.
  UPDATE public.market_bids
  SET status = 'rejected', updated_at = now()
  WHERE indent_id = v_indent.id AND id <> v_bid.id AND status = 'pending';

  -- A6.3: this driver just became unavailable (this trip is now their
  -- active trip) -- close out every OTHER pending bid this same driver
  -- holds, across BOTH Market and Reach, on any OTHER load. Runs in the
  -- same transaction as the trip insert above, so there is never a window
  -- where this trip exists but a competing pending bid for this driver is
  -- still actionable.
  UPDATE public.market_bids
  SET status = 'superseded', updated_at = now()
  WHERE bidder_user_id = v_bid.bidder_user_id
    AND status = 'pending'
    AND id <> v_bid.id;

  UPDATE public.driver_direct_bids
  SET status = 'superseded', updated_at = now()
  WHERE driver_user_id = v_bid.bidder_user_id
    AND status = 'pending';

  UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = v_indent.id;

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$function$;

-- ---------------------------------------------------------------------
-- 6. accept_driver_direct_bid() -- same availability pre-check and
-- cross-mechanism superseding, mirrored for the Reach award path.
CREATE OR REPLACE FUNCTION public.accept_driver_direct_bid(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_bid              public.driver_direct_bids;
  v_post             public.posts;
  v_campaign         record;
  v_indent           public.indents;
  v_driver_id        uuid;
  v_trip             public.trips%ROWTYPE;
  v_client_name      text;
BEGIN
  SELECT * INTO v_bid FROM public.driver_direct_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: bid %', p_bid_id;
  END IF;

  -- Lock the post for the duration of this decision (unchanged rationale
  -- from the live definition: serializes concurrent decisions on the same
  -- post so two pending bids cannot both be accepted).
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

  -- Idempotency, checked before the pending-status guard (unchanged rationale
  -- from the live definition: a retry on an already-accepted bid returns the
  -- same trip instead of raising).
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.source = 'direct_bid' AND t.source_bid_id = v_bid.id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', v_bid.status);
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state: bid already decided (current: %)', v_bid.status;
  END IF;

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

  -- A6.3: clean pre-check before attempting the trip insert, mirroring
  -- accept_market_bid. enforce_single_active_trip_per_driver() remains the
  -- final backstop, unchanged.
  IF NOT public.is_driver_available(v_bid.driver_user_id) THEN
    RAISE EXCEPTION 'driver_unavailable: this driver is already on an active trip';
  END IF;

  -- Frozen campaign snapshot -- same rate/route/vehicle the driver actually
  -- bid against, not whatever the live post might say now.
  SELECT rc.* INTO v_campaign
  FROM public.reach_campaigns rc
  WHERE rc.post_id = v_bid.post_id AND rc.status = 'active'
  ORDER BY rc.published_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no active campaign snapshot for post %', v_bid.post_id;
  END IF;

  -- NEW: when this post is linked to a real Indent, lock it too and enforce
  -- the same canonical-trip invariant the Market award path uses -- "lock
  -- the Indent, not just the bid." No new lock-ordering risk: this function
  -- already locks posts first and only conditionally adds the indents lock
  -- after it; accept_market_bid never locks a posts row, so there is no
  -- cross-transaction lock-order conflict on the same pair of resources.
  IF v_post.source_indent_id IS NOT NULL THEN
    SELECT * INTO v_indent FROM public.indents WHERE id = v_post.source_indent_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_found: indent % for post %', v_post.source_indent_id, v_post.id;
    END IF;

    IF lower(trim(coalesce(v_indent.status, ''))) NOT IN ('open', 'broadcast') THEN
      RAISE EXCEPTION 'indent_not_open: indent % is not open for award (status=%)', v_indent.id, v_indent.status;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.indent_id = v_indent.id AND t.status <> 'cancelled'
    ) THEN
      RAISE EXCEPTION 'already_awarded: indent % already has an active canonical trip', v_indent.id;
    END IF;

    v_client_name := coalesce(v_indent.client_name, '');
  ELSE
    v_indent := NULL;
    v_client_name := '';
  END IF;

  v_driver_id := public._resolve_or_create_market_driver(v_post.organization_id, v_bid.driver_user_id);

  INSERT INTO public.trips (
    organization_id,
    trip_number,
    source,
    source_bid_id,
    indent_id,
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
    CASE WHEN v_indent.id IS NOT NULL THEN v_indent.id ELSE NULL END,
    coalesce(v_campaign.snapshot_origin, ''),
    coalesce(v_campaign.snapshot_destination, ''),
    v_client_name,
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

  -- Only one direct bid may win this load -- close out the rest.
  UPDATE public.driver_direct_bids
  SET status = 'rejected', updated_at = now()
  WHERE post_id = v_bid.post_id AND id <> v_bid.id AND status = 'pending';

  -- A6.3: this driver just became unavailable -- close out every OTHER
  -- pending bid this same driver holds, across BOTH Reach and Market, on
  -- any OTHER load. Same transaction as the trip insert above.
  UPDATE public.driver_direct_bids
  SET status = 'superseded', updated_at = now()
  WHERE driver_user_id = v_bid.driver_user_id
    AND status = 'pending'
    AND id <> v_bid.id;

  UPDATE public.market_bids
  SET status = 'superseded', updated_at = now()
  WHERE bidder_user_id = v_bid.driver_user_id
    AND status = 'pending';

  -- NEW: when this trip carries real Indent lineage, mark the indent awarded
  -- so it stops appearing as open Market/Network demand. The existing
  -- terminal-status trigger (deactivate_posts_for_terminal_indent) then
  -- rejects any other pending bids/driver_direct_bids/market_bids on it.
  IF v_indent.id IS NOT NULL THEN
    UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = v_indent.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$function$;
