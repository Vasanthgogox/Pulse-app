-- Shipper counter on Pilot / fleet-owner driver_direct_bids (Review Hub).
-- Column counter_amount already exists (20270210171000); clients had SELECT-only
-- RLS, so this SECURITY DEFINER RPC is the write path (auth matches reject_driver_direct_bid).
-- Award amount prefers counter via coalesce in accept_driver_direct_bid (20270301050000).

CREATE OR REPLACE FUNCTION public.counter_driver_direct_bid(
  p_bid_id uuid,
  p_counter_amount numeric
)
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
  IF p_counter_amount IS NULL OR p_counter_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: counter must be a positive number';
  END IF;

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
  SET
    counter_amount = p_counter_amount,
    updated_at = now()
  WHERE id = p_bid_id;

  RETURN jsonb_build_object(
    'ok', true,
    'bid_id', p_bid_id,
    'counter_amount', p_counter_amount,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.counter_driver_direct_bid(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_driver_direct_bid(uuid, numeric) TO authenticated;

COMMENT ON FUNCTION public.counter_driver_direct_bid(uuid, numeric) IS
  'Shipper counter-offer on a pending driver_direct_bids row. Status stays pending; award still works. Auth matches reject_driver_direct_bid.';
