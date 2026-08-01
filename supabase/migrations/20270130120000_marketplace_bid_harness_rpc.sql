-- Gate 3 regression: service_role-only bid write path for parallel harness.
-- Mirrors submit_pulse_bid_with_direct_quote without auth.uid() so the harness
-- can fire true concurrent RPCs. Not granted to authenticated/anon.

CREATE OR REPLACE FUNCTION public.harness_submit_marketplace_bid(
  p_post_id uuid,
  p_bidder_org_id uuid,
  p_bidder_user_id uuid,
  p_amount numeric,
  p_note text DEFAULT 'harness'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_indent_id uuid;
  v_post_org_id uuid;
  v_bid_id uuid;
  v_already boolean := false;
  v_role text := coalesce(auth.role(), current_setting('role', true));
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'harness_forbidden: service_role only';
  END IF;
  IF p_bidder_user_id IS NULL THEN
    RAISE EXCEPTION 'harness_forbidden: bidder user required';
  END IF;

  SELECT p.source_indent_id, p.organization_id
  INTO v_indent_id, v_post_org_id
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;
  IF v_indent_id IS NULL THEN
    RAISE EXCEPTION 'POST_NOT_LINKED_TO_INDENT';
  END IF;
  IF p_bidder_org_id = v_post_org_id THEN
    RAISE EXCEPTION 'Cannot bid on your own organization''s post';
  END IF;
  IF NOT public.indent_open_for_marketplace_bids(v_indent_id) THEN
    RAISE EXCEPTION 'INDENT_NOT_OPEN_FOR_BIDS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.indents i
    WHERE i.id = v_indent_id AND i.organization_id = v_post_org_id
  ) THEN
    RAISE EXCEPTION 'Indent does not match post owner';
  END IF;

  UPDATE public.posts
  SET is_active = true, updated_at = now()
  WHERE id = p_post_id AND is_active IS DISTINCT FROM true;

  IF EXISTS (
    SELECT 1 FROM public.bids b
    WHERE b.post_id = p_post_id AND b.bidder_organization_id = p_bidder_org_id
  ) THEN
    v_already := true;
    UPDATE public.bids b
    SET amount = p_amount, note = nullif(trim(p_note), ''), updated_at = now()
    WHERE b.post_id = p_post_id
      AND b.bidder_organization_id = p_bidder_org_id
      AND b.status = 'pending'
    RETURNING b.id INTO v_bid_id;
    IF v_bid_id IS NULL THEN
      SELECT b.id INTO v_bid_id FROM public.bids b
      WHERE b.post_id = p_post_id AND b.bidder_organization_id = p_bidder_org_id;
    END IF;
  ELSE
    INSERT INTO public.bids (
      post_id, bidder_organization_id, bidder_user_id, amount, note, status
    ) VALUES (
      p_post_id, p_bidder_org_id, p_bidder_user_id, p_amount, nullif(trim(p_note), ''), 'pending'
    )
    RETURNING id INTO v_bid_id;
  END IF;

  INSERT INTO public.direct_quotes (
    indent_id, bidder_organization_id, amount, notes, status
  ) VALUES (
    v_indent_id, p_bidder_org_id, p_amount, nullif(trim(p_note), ''), 'pending'
  )
  ON CONFLICT (indent_id, bidder_organization_id)
  DO UPDATE SET
    amount = excluded.amount,
    notes = excluded.notes,
    updated_at = now();

  RETURN jsonb_build_object(
    'bid_id', v_bid_id,
    'already_bid', v_already,
    'post_id', p_post_id,
    'bidder_org_id', p_bidder_org_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.harness_submit_marketplace_bid(uuid, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.harness_submit_marketplace_bid(uuid, uuid, uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.harness_submit_marketplace_bid(uuid, uuid, uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.harness_submit_marketplace_bid(uuid, uuid, uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.harness_submit_marketplace_bid(uuid, uuid, uuid, numeric, text) IS
  'Gate 3 / M0 regression: service_role-only parallel bid harness. Same write path as submit_pulse_bid_with_direct_quote (indent gate, bids, direct_quotes, heal is_active).';
