-- Fix: accept_market_bid() cannot ever succeed for a dco-type Market bid.
--
-- trips.source_bid_id has a foreign key to driver_direct_bids(id) only
-- (trips_source_bid_id_fkey, added for the Reach flow). accept_market_bid()
-- was written assuming that same column could also hold a market_bids.id,
-- which violates that FK on every call:
--   23503: insert or update on table "trips" violates foreign key
--   constraint "trips_source_bid_id_fkey"
-- Confirmed by direct RPC invocation as a real, active business identity
-- (bid ecff1450-063b-4c29-ae0a-6284699037e6, org "nihas logs"); transaction
-- rolled back cleanly, no state left behind.
--
-- Fix: give Market its own FK column instead of overloading Reach's.
-- trips_source_bid_id_fkey and Reach's accept_driver_direct_bid() path are
-- untouched. trips_one_per_indent (UNIQUE on indent_id WHERE status <>
-- 'cancelled') is keyed on indent_id, not on either bid-id column, so it
-- already backstops duplicate-trip prevention regardless of this change.
--
-- submit_market_bid() and reject_market_bid() do not reference trips at
-- all (confirmed via pg_get_functiondef) and are not modified here.

ALTER TABLE public.trips
  ADD COLUMN source_market_bid_id uuid REFERENCES public.market_bids(id) ON DELETE SET NULL;

CREATE INDEX trips_source_market_bid_id_idx
  ON public.trips (source_market_bid_id)
  WHERE source_market_bid_id IS NOT NULL;

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

  -- Idempotency, checked before the pending-status guard -- same discipline
  -- as accept_driver_direct_bid: a retry on an already-accepted bid returns
  -- the same trip instead of raising.
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.source = 'market_bid' AND t.source_market_bid_id = v_bid.id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', v_bid.status);
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

  IF v_bid.bidder_type <> 'dco' THEN
    RAISE EXCEPTION 'not_implemented: Business-capacity Market award (bidder_type=organization) is not yet implemented -- see this migration''s header comment';
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

  UPDATE public.indents SET status = 'awarded', updated_at = now() WHERE id = v_indent.id;

  RETURN jsonb_build_object('ok', true, 'bid_id', p_bid_id, 'trip_id', v_trip.id, 'status', 'accepted');
END;
$function$;
