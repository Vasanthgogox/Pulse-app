-- When an indent reaches a terminal status (awarded, completed, etc.), deactivate linked
-- Pulse LOAD stories so they leave the feed and stop accepting bids.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Trigger: indent status → posts.is_active = false
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_posts_for_terminal_indent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_status := lower(trim(coalesce(NEW.status::text, '')));
  IF NOT (
    v_status = ANY (
      ARRAY['awarded', 'completed', 'cancelled', 'closed', 'expired']::text[]
    )
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.posts p
  SET
    is_active = false,
    updated_at = now()
  WHERE p.source_indent_id = NEW.id
    AND p.is_active = true;

  UPDATE public.bids b
  SET
    status = 'rejected',
    updated_at = now()
  WHERE b.status = 'pending'
    AND b.post_id IN (
      SELECT p.id FROM public.posts p WHERE p.source_indent_id = NEW.id
    );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.deactivate_posts_for_terminal_indent() IS
  'On indent awarded/completed/cancelled/closed/expired: deactivate linked LOAD stories and reject pending bids.';

DROP TRIGGER IF EXISTS trg_indents_deactivate_linked_posts ON public.indents;
CREATE TRIGGER trg_indents_deactivate_linked_posts
  AFTER UPDATE OF status ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.deactivate_posts_for_terminal_indent();

-- ---------------------------------------------------------------------------
-- 2) Block new Pulse bids when indent is no longer open
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
  v_indent_status text;
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

  SELECT lower(trim(coalesce(i.status::text, '')))
  INTO v_indent_status
  FROM public.indents i
  WHERE i.id = v_indent_id
    AND i.organization_id = v_post_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent does not match post owner';
  END IF;

  IF v_indent_status = ANY (
    ARRAY['awarded', 'completed', 'cancelled', 'closed', 'expired']::text[]
  ) THEN
    RAISE EXCEPTION 'INDENT_NOT_OPEN_FOR_BIDS';
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

COMMENT ON FUNCTION public.submit_pulse_bid_with_direct_quote(uuid, uuid, numeric, text) IS
  'Pulse bid: writes bids row and upserts direct_quotes. Rejects when indent is awarded/closed or post inactive.';

COMMIT;
