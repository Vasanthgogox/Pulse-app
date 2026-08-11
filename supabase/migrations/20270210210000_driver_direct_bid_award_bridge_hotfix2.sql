-- Hotfix v2: accept_driver_direct_bid — handle the (organization_id, phone)
-- active-phone conflict on the new-driver-row fallback, found by the
-- synthetic runtime verification suite for 20270210200000 (hotfix v1).
--
-- v1 fixed the identity-hijack defect: a phone match belonging to a
-- DIFFERENT already-linked driver is no longer relinked to the new bidder;
-- instead a separate row is created for the bidder. That fallback INSERT
-- carries the bidder's own phone number — which, in exactly the collision
-- scenario this exists to protect against, is the SAME phone the other,
-- still-active driver row already holds. idx_drivers_active_phone (from the
-- unrelated, pre-existing employment-stint work: UNIQUE (organization_id,
-- phone) WHERE left_at IS NULL AND phone IS NOT NULL) then rejects the
-- INSERT outright, aborting the whole accept with a raw duplicate-key error.
-- Confirmed via a synthetic org/two synthetic drivers sharing a phone: the
-- failure is fully transactional (bid stays pending, no partial rows, no
-- corruption) but the accept itself cannot complete for that bidder.
--
-- Fix: on that specific conflict, retry the insert with phone = NULL instead
-- of raising. We already have the bidder's real identity from their
-- authenticated user_id; not claiming a phone number that is already
-- another active driver's is more correct than failing outright. This
-- mirrors the ON CONFLICT ... DO NOTHING / fallback idiom already used by
-- accept_driver_invite for the same constraint (20261207150000) — reused
-- here, not modified there.
--
-- Everything else — idempotency-first check, the identity-protection guard
-- itself, the post-row FOR UPDATE serialization, reject_driver_direct_bid,
-- submit_driver_direct_bid, driver_commission = bid.amount, frozen campaign
-- snapshot, relationship_origin = 'phone_assignment' — is unchanged.
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

  SELECT rc.* INTO v_campaign
  FROM public.reach_campaigns rc
  WHERE rc.post_id = v_bid.post_id AND rc.status = 'active'
  ORDER BY rc.published_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no active campaign snapshot for post %', v_bid.post_id;
  END IF;

  SELECT
    nullif(trim(coalesce(p.full_name, '')), ''),
    nullif(trim(coalesce(p.phone, '')), '')
  INTO v_driver_name, v_driver_phone
  FROM public.profiles p
  WHERE p.id = v_bid.driver_user_id;
  v_driver_name := coalesce(v_driver_name, 'Driver');
  v_last10 := right(regexp_replace(coalesce(v_driver_phone, ''), '\D', '', 'g'), 10);

  SELECT d.id, d.user_id INTO v_driver_id, v_matched_user_id
  FROM public.drivers d
  WHERE d.organization_id = v_post.organization_id
    AND (
      d.user_id = v_bid.driver_user_id
      OR (length(v_last10) = 10 AND d.phone_normalised = v_last10)
    )
  ORDER BY CASE WHEN d.user_id = v_bid.driver_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_driver_id IS NOT NULL AND v_matched_user_id IS NOT NULL AND v_matched_user_id <> v_bid.driver_user_id THEN
    v_driver_id := NULL;
  END IF;

  IF v_driver_id IS NULL THEN
    -- idx_drivers_active_phone (pre-existing, unrelated) enforces one ACTIVE
    -- (left_at IS NULL) row per (organization_id, phone). When the bidder's
    -- own phone is the exact number already claimed by the different active
    -- driver detected above, inserting with that phone would hit this
    -- constraint. ON CONFLICT DO NOTHING catches that instead of letting it
    -- raise and abort the whole accept.
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
  'Accept a pending driver_direct_bids row and atomically create the trip: resolves/creates a same-org driver stub for the bidder (same convention as assign_aggregate_trip_driver, never relinking an already-claimed row; falls back to phone=NULL if the bidder''s phone is already another active driver''s), stamps driver_commission directly from the accepted bid amount, is idempotent by source_bid_id, and serializes same-post awards via a posts row lock. Caller must be a non-driver member of the org that owns the post.';
