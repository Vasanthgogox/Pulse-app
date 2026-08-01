-- Reach Stability Sprint P0.1 — story visibility follows indent bidding lifetime.
--
-- Problem: marketplace discovery was gated by posts.expires_at (~24h client clock)
-- and posts.is_active flips from client auto-deactivate, while commercial life is
-- owned by indents. ~18% of story-linked awards (90d sample) happened after
-- posts.expires_at — competition died while the indent was still open.
--
-- Rule:
--   Indent open for bids  → story visible (backend)
--   Indent awarded/cancelled/withdrawn/expired/closed → story closed
-- posts.expires_at is not a visibility authority for indent-linked LOAD stories.
--
-- NOTE ON VERSIONING: off-midnight after 20270128103100 (sibling repo uses
-- YYYYMMDD000000 for shared project versions).

-- ── 1. Shared predicate: indent still accepting marketplace bids ─────────────

CREATE OR REPLACE FUNCTION public.indent_open_for_marketplace_bids(p_indent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.indents i
    WHERE i.id = p_indent_id
      AND i.deleted_at IS NULL
      AND lower(trim(coalesce(i.status::text, ''))) <> ALL (
        ARRAY[
          'awarded',
          'completed',
          'cancelled',
          'closed',
          'expired',
          'draft'
        ]::text[]
      )
  );
$$;

COMMENT ON FUNCTION public.indent_open_for_marketplace_bids(uuid) IS
  'True when the indent may still receive marketplace / story bids. Authority for LOAD story visibility (P0.1).';

REVOKE ALL ON FUNCTION public.indent_open_for_marketplace_bids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.indent_open_for_marketplace_bids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.indent_open_for_marketplace_bids(uuid) TO service_role;

-- ── 2. get_network_feed — indent lifecycle for LOAD stories ──────────────────

DROP FUNCTION IF EXISTS public.get_network_feed(uuid, integer, integer);

CREATE FUNCTION public.get_network_feed(p_org_id uuid, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(
   id uuid, organization_id uuid, org_name text, org_avatar_seed text, org_avatar_url text,
   author_user_id uuid, type text, content text, origin text, destination text, load_date date,
   vehicle_type text, weight_tonnes numeric, rate_offer numeric, material text,
   expires_at timestamp with time zone, is_active boolean, view_count integer, bid_count bigint,
   created_at timestamp with time zone, source_indent_id uuid,
   is_sponsored boolean, reach_campaign_id uuid
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM (
    -- Branch A: live posts.
    -- Indent-linked LOAD: visible while indent_open_for_marketplace_bids (ignore
    -- posts.expires_at / stale is_active from client auto-deactivate).
    -- Other post types: keep is_active = true.
    SELECT
      p.id, p.organization_id, o.name AS org_name, o.avatar_seed AS org_avatar_seed, o.logo_url AS org_avatar_url,
      p.author_user_id, p.type, p.content, p.origin, p.destination, p.load_date, p.vehicle_type, p.weight_tonnes,
      p.rate_offer, p.material, p.expires_at,
      CASE
        WHEN upper(coalesce(p.type, '')) = 'LOAD' AND p.source_indent_id IS NOT NULL
          THEN public.indent_open_for_marketplace_bids(p.source_indent_id)
        ELSE p.is_active
      END AS is_active,
      p.view_count,
      COALESCE(b.cnt, 0) AS bid_count, p.created_at, p.source_indent_id,
      (rc.status = 'active') AS is_sponsored, rc.id AS reach_campaign_id
    FROM public.posts p
    JOIN public.organizations o ON o.id = p.organization_id
    LEFT JOIN (
      SELECT post_id, count(*) AS cnt FROM public.bids GROUP BY post_id
    ) b ON b.post_id = p.id
    LEFT JOIN LATERAL (
      SELECT rc2.id, rc2.status FROM public.reach_campaigns rc2
      WHERE rc2.post_id = p.id
      ORDER BY rc2.created_at DESC
      LIMIT 1
    ) rc ON true
    WHERE
      (
        (
          upper(coalesce(p.type, '')) = 'LOAD'
          AND p.source_indent_id IS NOT NULL
          AND public.indent_open_for_marketplace_bids(p.source_indent_id)
        )
        OR (
          -- Shipper history: own LOAD stories remain fetchable after award
          -- (is_active below is false so market UIs that require active skip them).
          upper(coalesce(p.type, '')) = 'LOAD'
          AND p.source_indent_id IS NOT NULL
          AND p.organization_id = p_org_id
        )
        OR (
          NOT (
            upper(coalesce(p.type, '')) = 'LOAD'
            AND p.source_indent_id IS NOT NULL
          )
          AND p.is_active = true
        )
      )
      AND (
        p.organization_id = p_org_id
        OR p.organization_id IN (
          SELECT cr.to_organization_id FROM public.connection_requests cr
          WHERE cr.from_organization_id = p_org_id AND cr.status = 'approved'
          UNION
          SELECT cr.from_organization_id FROM public.connection_requests cr
          WHERE cr.to_organization_id = p_org_id AND cr.status = 'approved'
        )
        OR (
          rc.status = 'active'
          AND EXISTS (
            SELECT 1 FROM public.reach_campaign_targets t
            WHERE t.campaign_id = rc.id AND t.org_id = p_org_id AND t.released_at <= now()
          )
        )
      )

    UNION ALL

    -- Branch B: snapshot-served campaigns (source story deleted/deactivated).
    -- Still require indent open when snapshot has a source indent — do not
    -- advertise an awarded load from a stale campaign window.
    SELECT
      COALESCE(rc.post_id, rc.id) AS id, rc.org_id AS organization_id,
      o.name AS org_name, o.avatar_seed AS org_avatar_seed, o.logo_url AS org_avatar_url,
      rc.created_by AS author_user_id,
      COALESCE(rc.snapshot_post_type, 'UPDATE') AS type,
      rc.snapshot_content AS content, rc.snapshot_origin AS origin, rc.snapshot_destination AS destination,
      NULL::date AS load_date, rc.snapshot_vehicle_type AS vehicle_type, NULL::numeric AS weight_tonnes,
      NULL::numeric AS rate_offer, rc.snapshot_material AS material,
      rc.expires_at, true AS is_active, 0 AS view_count,
      COALESCE(b.cnt, 0) AS bid_count,
      COALESCE(rc.snapshot_posted_at, rc.published_at) AS created_at,
      rc.snapshot_source_indent_id AS source_indent_id,
      true AS is_sponsored, rc.id AS reach_campaign_id
    FROM public.reach_campaigns rc
    JOIN public.organizations o ON o.id = rc.org_id
    LEFT JOIN (
      SELECT post_id, count(*) AS cnt FROM public.bids GROUP BY post_id
    ) b ON b.post_id = rc.post_id
    WHERE rc.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.posts p2 WHERE p2.id = rc.post_id AND p2.is_active = true
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.bids ab
        WHERE ab.post_id = rc.post_id AND ab.status = 'accepted'
      )
      AND (
        rc.snapshot_source_indent_id IS NULL
        OR public.indent_open_for_marketplace_bids(rc.snapshot_source_indent_id)
      )
      AND (
        rc.org_id = p_org_id
        OR EXISTS (
          SELECT 1 FROM public.reach_campaign_targets t
          WHERE t.campaign_id = rc.id AND t.org_id = p_org_id AND t.released_at <= now()
        )
      )
  ) feed
  ORDER BY feed.is_sponsored DESC, feed.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

COMMENT ON FUNCTION public.get_network_feed(uuid, integer, integer) IS
  'Network feed. Indent-linked LOAD stories stay visible while indent_open_for_marketplace_bids; posts.expires_at is not a visibility gate. Sponsored delivery via reach_campaign_targets; Branch B serves snapshots only while the linked indent (if any) is still open.';

-- ── 3. get_story_preview — same indent authority for share-link gate ────────

CREATE OR REPLACE FUNCTION public.get_story_preview(p_post_id uuid)
 RETURNS TABLE(
   id uuid, organization_id uuid, org_name text, type text, origin text,
   destination text, load_date date, vehicle_type text,
   expires_at timestamp with time zone, is_active boolean
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p.id, p.organization_id, o.name AS org_name, p.type, p.origin, p.destination,
    p.load_date, p.vehicle_type, p.expires_at,
    CASE
      WHEN upper(coalesce(p.type, '')) = 'LOAD' AND p.source_indent_id IS NOT NULL
        THEN public.indent_open_for_marketplace_bids(p.source_indent_id)
      ELSE p.is_active
    END AS is_active
  FROM public.posts p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = p_post_id

  UNION ALL

  SELECT
    COALESCE(rc.post_id, rc.id) AS id, rc.org_id AS organization_id, o.name AS org_name,
    COALESCE(rc.snapshot_post_type, 'UPDATE') AS type,
    rc.snapshot_origin AS origin, rc.snapshot_destination AS destination,
    NULL::date AS load_date, rc.snapshot_vehicle_type AS vehicle_type,
    rc.expires_at, true AS is_active
  FROM public.reach_campaigns rc
  JOIN public.organizations o ON o.id = rc.org_id
  WHERE rc.post_id = p_post_id
    AND rc.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.posts p2
      WHERE p2.id = rc.post_id
        AND (
          CASE
            WHEN upper(coalesce(p2.type, '')) = 'LOAD' AND p2.source_indent_id IS NOT NULL
              THEN public.indent_open_for_marketplace_bids(p2.source_indent_id)
            ELSE p2.is_active
          END
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bids ab
      WHERE ab.post_id = rc.post_id AND ab.status = 'accepted'
    )
    AND (
      rc.snapshot_source_indent_id IS NULL
      OR public.indent_open_for_marketplace_bids(rc.snapshot_source_indent_id)
    )
  ORDER BY is_active DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.get_story_preview(uuid) IS
  'Story-link preview. Indent-linked LOAD is_active mirrors indent_open_for_marketplace_bids; falls back to Reach campaign snapshot when live projection is gone but indent (if any) is still open.';

-- ── 4. Bid RPC — indent status is the gate (not posts.is_active) ────────────

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

  SELECT lower(trim(coalesce(i.status::text, '')))
  INTO v_indent_status
  FROM public.indents i
  WHERE i.id = v_indent_id
    AND i.organization_id = v_post_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent does not match post owner';
  END IF;

  -- Heal projection rows wrongly deactivated by the old client 24h clock.
  UPDATE public.posts
  SET is_active = true, updated_at = now()
  WHERE id = p_post_id
    AND is_active IS DISTINCT FROM true;

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
  'Pulse bid: indent_open_for_marketplace_bids is the gate (not posts.is_active / expires_at). Heals stale is_active on open indents.';

-- ── 5. Backfill projection rows killed by the 24h client clock ───────────────

UPDATE public.posts p
SET
  is_active = true,
  updated_at = now()
WHERE upper(coalesce(p.type, '')) = 'LOAD'
  AND p.source_indent_id IS NOT NULL
  AND coalesce(p.is_active, false) = false
  AND public.indent_open_for_marketplace_bids(p.source_indent_id);
