-- Atomic Pulse bid + direct_quote; indent status -> quoted; backfill from linked posts.

-- ---------------------------------------------------------------------------
-- 1) Bump indent to quoted when a pending direct_quote row exists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_indent_quoted_on_direct_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;
  UPDATE public.indents i
  SET
    status = 'quoted',
    updated_at = now()
  WHERE i.id = NEW.indent_id
    AND lower(trim(i.status::text)) = ANY (
      ARRAY['pending', 'broadcast', 'open', 'draft']::text[]
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_direct_quotes_set_indent_quoted ON public.direct_quotes;
CREATE TRIGGER trg_direct_quotes_set_indent_quoted
  AFTER INSERT OR UPDATE OF amount, notes, status ON public.direct_quotes
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.set_indent_quoted_on_direct_quote();

COMMENT ON FUNCTION public.set_indent_quoted_on_direct_quote() IS
  'When a pending direct_quote is written, set owning indent to quoted if still in an open-ish status.';

-- ---------------------------------------------------------------------------
-- 2) Single RPC: insert/update bid + upsert direct_quote (no client-side sync)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_pulse_bid_with_direct_quote(
  p_post_id uuid,
  p_bidder_org_id uuid,
  p_amount numeric,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_indent_id uuid;
  v_post_org_id uuid;
  v_post_active boolean;
  v_bid_id uuid;
  v_already boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_org_member(p_bidder_org_id) THEN
    RAISE EXCEPTION 'Not a member of bidder organization';
  END IF;

  SELECT p.source_indent_id, p.organization_id, p.is_active
  INTO v_indent_id, v_post_org_id, v_post_active
  FROM public.posts p
  WHERE p.id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;
  IF v_indent_id IS NULL THEN
    RAISE EXCEPTION 'POST_NOT_LINKED_TO_INDENT';
  END IF;
  IF NOT coalesce(v_post_active, false) THEN
    RAISE EXCEPTION 'Post is not active';
  END IF;
  IF p_bidder_org_id = v_post_org_id THEN
    RAISE EXCEPTION 'Cannot bid on your own organization''s post';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.indents i
    WHERE i.id = v_indent_id
      AND i.organization_id = v_post_org_id
  ) THEN
    RAISE EXCEPTION 'Indent does not match post owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bids b
    WHERE b.post_id = p_post_id
      AND b.bidder_organization_id = p_bidder_org_id
  ) THEN
    v_already := true;
    UPDATE public.bids b
    SET
      amount = p_amount,
      note = nullif(trim(p_note), ''),
      updated_at = now()
    WHERE b.post_id = p_post_id
      AND b.bidder_organization_id = p_bidder_org_id
      AND b.status = 'pending'
    RETURNING b.id INTO v_bid_id;
    IF v_bid_id IS NULL THEN
      SELECT b.id INTO v_bid_id
      FROM public.bids b
      WHERE b.post_id = p_post_id
        AND b.bidder_organization_id = p_bidder_org_id;
    END IF;
  ELSE
    INSERT INTO public.bids (
      post_id,
      bidder_organization_id,
      bidder_user_id,
      amount,
      note,
      status
    )
    VALUES (
      p_post_id,
      p_bidder_org_id,
      v_uid,
      p_amount,
      nullif(trim(p_note), ''),
      'pending'
    )
    RETURNING id INTO v_bid_id;
  END IF;

  INSERT INTO public.direct_quotes (
    indent_id,
    bidder_organization_id,
    amount,
    notes,
    status
  )
  VALUES (
    v_indent_id,
    p_bidder_org_id,
    p_amount,
    nullif(trim(p_note), ''),
    'pending'
  )
  ON CONFLICT (indent_id, bidder_organization_id)
  DO UPDATE SET
    amount = excluded.amount,
    notes = excluded.notes,
    updated_at = now();

  RETURN jsonb_build_object('bid_id', v_bid_id, 'already_bid', v_already);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_pulse_bid_with_direct_quote(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_pulse_bid_with_direct_quote(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_pulse_bid_with_direct_quote(uuid, uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.submit_pulse_bid_with_direct_quote(uuid, uuid, numeric, text) IS
  'Pulse bid: writes bids row and upserts direct_quotes for posts.source_indent_id (deterministic).';

-- ---------------------------------------------------------------------------
-- 3) Backfill direct_quotes from bids on posts that already have source_indent_id
-- ---------------------------------------------------------------------------
INSERT INTO public.direct_quotes (
  indent_id,
  bidder_organization_id,
  amount,
  notes,
  status
)
SELECT
  p.source_indent_id,
  b.bidder_organization_id,
  b.amount,
  b.note,
  CASE WHEN b.status = 'pending' THEN 'pending'::text ELSE b.status END
FROM public.bids b
JOIN public.posts p ON p.id = b.post_id
WHERE p.source_indent_id IS NOT NULL
  AND b.status = 'pending'
ON CONFLICT (indent_id, bidder_organization_id) DO NOTHING;
