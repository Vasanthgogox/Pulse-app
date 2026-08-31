-- WS1 (Gate 4, step 6 of 7): extract the driver-resolution core of
-- accept_driver_direct_bid() into a shared, internal function, and retrofit
-- accept_driver_direct_bid() to (a) call it instead of inlining the logic,
-- and (b) populate trips.indent_id / real client_name when the underlying
-- post is linked to a real Indent (posts.source_indent_id) -- closing the
-- lineage defect found by the Gate 2 audit (indent_id dropped, client_name
-- hardcoded to '').
--
-- The extracted block below started as a VERBATIM copy of the live
-- accept_driver_direct_bid() body (20270210190000), including its exact
-- comments explaining the phone-match-hijack protection added by the two
-- 2027-02-10 hotfixes, then received three deliberate, disclosed changes on
-- top during a post-implementation static review (Gate 4 hardening pass H1
-- + H2), not silent drift from the original:
--
-- (1) It is now a standalone function taking (organization_id,
--     bidder_user_id) instead of reading v_post/v_bid directly, so
--     accept_market_bid() (next migration) can call the exact same code.
--
-- (2) relationship_origin for a genuinely NEW row is now 'market_award'
--     instead of 'phone_assignment' -- the value this migration adds to the
--     CHECK constraint specifically for this shared engine. Zero real rows
--     have ever been created through this bridge (confirmed: 0
--     accepted/rejected bids, 0 trips with source_bid_id set at last
--     check), so there is no live data whose relationship_origin this
--     changes retroactively.
--
-- (3) H1/H2 hardening: the insert now (a) reactivates a 'disconnected' row
--     back to 'independent' (clearing left_at) when reusing it -- the
--     original body only ever reused active/independent rows unchanged and
--     silently left a disconnected row's stale status untouched, which
--     contradicted the already-locked "disconnected -> independent on
--     renewed Market participation" rule -- and (b) catches unique_violation
--     generically instead of naming only the phone index as its ON CONFLICT
--     arbiter, because a read-only pg_indexes check during this hardening
--     pass found a SECOND, pre-existing, already-live unique index
--     (idx_drivers_active_user, on (organization_id, user_id) WHERE
--     left_at IS NULL) that the original ON CONFLICT clause could not catch
--     -- a concurrent insert colliding with THAT index instead of the phone
--     one would have raised an unhandled exception, in both the original
--     live function and an unmodified extraction of it.
--
-- driver_direct_bids itself is NOT modified by this migration -- no column,
-- no constraint, no RLS change. Only the two functions below change.

CREATE OR REPLACE FUNCTION public._resolve_or_create_market_driver(
  p_organization_id uuid,
  p_bidder_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver_phone     text;
  v_driver_name      text;
  v_last10           text;
  v_driver_id        uuid;
  v_matched_user_id  uuid;
BEGIN
  -- Resolve the bidder's identity (already authenticated -- not an
  -- OTP-pending stub like assign_aggregate_trip_driver's phone-match case).
  SELECT
    nullif(trim(coalesce(p.full_name, '')), ''),
    nullif(trim(coalesce(p.phone, '')), '')
  INTO v_driver_name, v_driver_phone
  FROM public.profiles p
  WHERE p.id = p_bidder_user_id;
  v_driver_name := coalesce(v_driver_name, 'Driver');
  v_last10 := right(regexp_replace(coalesce(v_driver_phone, ''), '\D', '', 'g'), 10);

  -- Same-org driver stub, resolved by phone or by this exact user_id if a row
  -- already exists -- identical convention to assign_aggregate_trip_driver's
  -- own phone-match-or-create logic. One stub per (org, phone), not a single
  -- global driver identity; this is how a Driver-cum-Owner is represented
  -- under any given shipper org today, with no schema change.
  SELECT d.id, d.user_id INTO v_driver_id, v_matched_user_id
  FROM public.drivers d
  WHERE d.organization_id = p_organization_id
    AND (
      d.user_id = p_bidder_user_id
      OR (length(v_last10) = 10 AND d.phone_normalised = v_last10)
    )
  ORDER BY CASE WHEN d.user_id = p_bidder_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  -- A phone match is only safe to reuse when the matched row is unclaimed
  -- (user_id IS NULL) or already belongs to this exact bidder. If it belongs
  -- to a DIFFERENT real, already-linked user -- a recycled number, a shared
  -- family phone, a data-entry duplicate -- reusing it would silently
  -- reassign that other person's driver identity/history to this bidder.
  -- Treat that case as no match and create a separate row for the bidder
  -- below instead of hijacking the existing one.
  IF v_driver_id IS NOT NULL AND v_matched_user_id IS NOT NULL AND v_matched_user_id <> p_bidder_user_id THEN
    v_driver_id := NULL;
  END IF;

  IF v_driver_id IS NULL THEN
    -- Two DIFFERENT unique indexes can reject this insert:
    --   idx_drivers_active_phone  (organization_id, phone)   WHERE left_at IS NULL AND phone IS NOT NULL
    --   idx_drivers_active_user   (organization_id, user_id) WHERE left_at IS NULL AND user_id IS NOT NULL
    -- (the second one is a pre-existing, already-live invariant, confirmed
    -- via a read-only pg_indexes check against the linked project during the
    -- Gate 4 hardening pass -- it was not created by this migration and
    -- already holds today with zero violating rows). A plain
    -- ON CONFLICT (...) DO NOTHING only names ONE arbiter index; an insert
    -- that instead collides with the OTHER one raises an unhandled
    -- unique_violation rather than being caught. Catching the exception
    -- generically covers whichever of the two actually fires, without
    -- needing to guess which one in advance.
    BEGIN
      INSERT INTO public.drivers (
        organization_id, name, phone, user_id, status, tracking_only,
        relationship_origin, relationship_status
      )
      VALUES (
        p_organization_id, v_driver_name, v_driver_phone, p_bidder_user_id,
        'offline', true, 'market_award', 'independent'
      )
      RETURNING id INTO v_driver_id;
    EXCEPTION WHEN unique_violation THEN
      -- Re-resolve by (organization_id, user_id) first: if a concurrent
      -- award for this exact same person under this exact same org won the
      -- race (idx_drivers_active_user), that is the row to reuse.
      SELECT d.id INTO v_driver_id
      FROM public.drivers d
      WHERE d.organization_id = p_organization_id
        AND d.user_id = p_bidder_user_id
        AND d.left_at IS NULL
      LIMIT 1;

      IF v_driver_id IS NULL THEN
        -- Not a user_id collision -- must have been the phone conflict: the
        -- phone is already claimed by a different active driver (never
        -- relinked above). Insert the bidder's own row without claiming
        -- that phone number -- we still know exactly who they are from
        -- their authenticated user_id, and not storing a phone that is
        -- already someone else's is more correct than failing outright.
        INSERT INTO public.drivers (
          organization_id, name, phone, user_id, status, tracking_only,
          relationship_origin, relationship_status
        )
        VALUES (
          p_organization_id, v_driver_name, NULL, p_bidder_user_id,
          'offline', true, 'market_award', 'independent'
        )
        RETURNING id INTO v_driver_id;
      END IF;
    END;
  ELSIF v_matched_user_id IS NULL THEN
    -- Existing stub matched by phone only (no user_id yet) -- link it, since
    -- we now know exactly who this is from the authenticated bid itself.
    UPDATE public.drivers SET user_id = p_bidder_user_id, updated_at = now()
    WHERE id = v_driver_id;
  END IF;

  -- Reactivation: a person who previously left this org (relationship_status
  -- = 'disconnected', left_at set) and now wins a NEW Market/Reach award
  -- from the SAME org resumes on the SAME row -- never a second row. This is
  -- a no-op for a just-created row (already 'independent') and for an
  -- already-active row (status isn't 'disconnected'), so it is safe to run
  -- unconditionally on whatever v_driver_id ended up being. relationship_origin
  -- is deliberately NOT touched here -- it describes how the relationship
  -- began, not its current state, and reactivation does not change history.
  UPDATE public.drivers
  SET relationship_status = 'independent', left_at = NULL, updated_at = now()
  WHERE id = v_driver_id
    AND relationship_status = 'disconnected';

  RETURN v_driver_id;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_or_create_market_driver(uuid, uuid) FROM PUBLIC;

COMMENT ON FUNCTION public._resolve_or_create_market_driver(uuid, uuid) IS
  'Shared identity-resolution core of the Market/Reach award engine, extracted verbatim from accept_driver_direct_bid (20270210190000, hardened by two prior hotfixes for phone-match identity-hijack and duplicate-key handling). Reuses an existing (organization_id, user_id) driver row unchanged; falls back to phone match only when unclaimed or already the same user; creates a new row (relationship_origin=market_award, relationship_status=independent, tracking_only=true) only when neither resolves. Called by both accept_driver_direct_bid and accept_market_bid -- do not duplicate this logic a second time.';

-- ── accept_driver_direct_bid -- retrofitted to use the shared resolver and
--    to preserve Indent lineage when the post it is bidding on is linked to
--    a real Indent (posts.source_indent_id). Locking order, idempotency
--    check, competing-bid rejection, and campaign-snapshot lookup are
--    UNCHANGED from the live definition -- only the driver-resolution block
--    and the trip INSERT's indent_id/client_name/status side-effect are new.
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

  -- NEW: when this trip carries real Indent lineage, mark the indent awarded
  -- so it stops appearing as open Market/Network demand. The existing
  -- terminal-status trigger (deactivate_posts_for_terminal_indent) then
  -- rejects any other pending bids/driver_direct_bids/market_bids on it.
  IF v_indent.id IS NOT NULL THEN
    UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = v_indent.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$$;

REVOKE ALL ON FUNCTION public.accept_driver_direct_bid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_driver_direct_bid(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_driver_direct_bid(uuid) IS
  'Accept a pending driver_direct_bids row and atomically create the trip via the shared _resolve_or_create_market_driver engine. When the underlying post is linked to a real Indent (posts.source_indent_id), also locks that indent, enforces the one-non-cancelled-canonical-trip invariant, populates trips.indent_id and the real client_name, and marks the indent awarded -- closing the lineage gap found by the Gate 2 audit. Caller must be a non-driver member of the org that owns the post.';
