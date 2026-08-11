-- Phase 3B.1 — Fleet Owner capacity Stories on existing public.posts.
-- type = VEHICLE_AVAILABILITY, organization_id NULL (no personal Business org).
-- Optional owner_vehicle_id reference — availability signal only, not trip assignment.
-- No bidding / Boost / trip create in this migration.
-- See docs/DRIVER_FLEET_OWNER_PHASE1.md

-- ── 1. Widen posts.type CHECK ───────────────────────────────────────────────
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_type_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_type_check
  CHECK (type = ANY (ARRAY['UPDATE'::text, 'LOAD'::text, 'VEHICLE_AVAILABILITY'::text]));

-- ── 2. Allow FO posts without organization_id ─────────────────────────────
ALTER TABLE public.posts
  ALTER COLUMN organization_id DROP NOT NULL;

COMMENT ON COLUMN public.posts.organization_id IS
  'Business org for org-authored Stories. NULL only for Fleet Owner capacity Stories (type VEHICLE_AVAILABILITY, no personal org).';

-- ── 3. Soft reference to personal fleet inventory ─────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS owner_vehicle_id uuid
    REFERENCES public.owner_vehicles (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.posts.owner_vehicle_id IS
  'Optional Fleet Owner vehicle inventory link for capacity Stories. Does not imply trip assignment.';

CREATE INDEX IF NOT EXISTS idx_posts_owner_vehicle_id
  ON public.posts (owner_vehicle_id)
  WHERE owner_vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_fo_capacity_author
  ON public.posts (author_user_id, created_at DESC)
  WHERE organization_id IS NULL AND type = 'VEHICLE_AVAILABILITY';

-- Shape: either classic org post, or FO capacity (null org + VEHICLE_AVAILABILITY, no indent).
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_fo_capacity_shape;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_fo_capacity_shape CHECK (
    organization_id IS NOT NULL
    OR (
      type = 'VEHICLE_AVAILABILITY'
      AND source_indent_id IS NULL
    )
  );

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_owner_vehicle_requires_fo_post;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_owner_vehicle_requires_fo_post CHECK (
    owner_vehicle_id IS NULL OR organization_id IS NULL
  );

-- ── 4. RLS — Fleet Owner author paths (org policies unchanged) ────────────
DROP POLICY IF EXISTS posts_insert_fo_capacity ON public.posts;
CREATE POLICY posts_insert_fo_capacity ON public.posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NULL
    AND type = 'VEHICLE_AVAILABILITY'
    AND source_indent_id IS NULL
    AND author_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS posts_update_fo_capacity ON public.posts;
CREATE POLICY posts_update_fo_capacity ON public.posts
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NULL
    AND author_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
  )
  WITH CHECK (
    organization_id IS NULL
    AND type = 'VEHICLE_AVAILABILITY'
    AND source_indent_id IS NULL
    AND author_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS posts_delete_fo_capacity ON public.posts;
CREATE POLICY posts_delete_fo_capacity ON public.posts
  FOR DELETE
  TO authenticated
  USING (
    organization_id IS NULL
    AND author_user_id = (SELECT auth.uid())
    AND public.is_driver_fleet_owner((SELECT auth.uid()))
  );

-- Authors can always read their own FO capacity rows (incl. after deactivate).
DROP POLICY IF EXISTS posts_select_fo_capacity_own ON public.posts;
CREATE POLICY posts_select_fo_capacity_own ON public.posts
  FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    AND author_user_id = (SELECT auth.uid())
  );

-- Active posts remain readable via existing posts_select_authenticated (is_active = true).

-- ── 5. Create capacity Story (SECURITY DEFINER; public vehicle fields only) ─
CREATE OR REPLACE FUNCTION public.create_fleet_owner_capacity_story(
  p_owner_vehicle_id uuid,
  p_available_from date DEFAULT NULL,
  p_origin text DEFAULT NULL,
  p_destination text DEFAULT NULL,
  p_rate_offer numeric DEFAULT NULL,
  p_content text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_origin text := nullif(btrim(coalesce(p_origin, '')), '');
  v_destination text := nullif(btrim(coalesce(p_destination, '')), '');
  v_content text := nullif(btrim(coalesce(p_content, '')), '');
  v_vehicle public.owner_vehicles%ROWTYPE;
  v_row public.posts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_driver_fleet_owner(v_uid) THEN
    RAISE EXCEPTION 'Fleet Owner capability required';
  END IF;

  IF v_origin IS NULL THEN
    RAISE EXCEPTION 'origin is required';
  END IF;

  IF p_rate_offer IS NOT NULL AND p_rate_offer <= 0 THEN
    RAISE EXCEPTION 'rate_offer must be positive when provided';
  END IF;

  IF p_owner_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'owner_vehicle_id is required';
  END IF;

  SELECT *
  INTO v_vehicle
  FROM public.owner_vehicles ov
  WHERE ov.id = p_owner_vehicle_id
    AND ov.owner_user_id = v_uid
    AND ov.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found in My Fleet';
  END IF;

  IF v_vehicle.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Vehicle must be active to share as Story';
  END IF;

  -- Public payload only: type / capacity / optional note. Never copy documents.
  INSERT INTO public.posts (
    organization_id,
    author_user_id,
    type,
    content,
    origin,
    destination,
    load_date,
    vehicle_type,
    weight_tonnes,
    rate_offer,
    material,
    expires_at,
    is_active,
    source_indent_id,
    owner_vehicle_id
  ) VALUES (
    NULL,
    v_uid,
    'VEHICLE_AVAILABILITY',
    v_content,
    v_origin,
    v_destination,
    p_available_from,
    nullif(btrim(coalesce(v_vehicle.vehicle_type, '')), ''),
    NULL,
    p_rate_offer,
    nullif(btrim(coalesce(v_vehicle.capacity, '')), ''),
    COALESCE(p_expires_at, now() + interval '7 days'),
    true,
    NULL,
    v_vehicle.id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.create_fleet_owner_capacity_story IS
  'Phase 3B.1: Fleet Owner publishes a VEHICLE_AVAILABILITY Story referencing an owner_vehicle. Availability only — not a bid or trip assignment.';

REVOKE ALL ON FUNCTION public.create_fleet_owner_capacity_story(
  uuid, date, text, text, numeric, text, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_fleet_owner_capacity_story(
  uuid, date, text, text, numeric, text, timestamptz
) TO authenticated;

-- ── 6. Deactivate (take offline) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_fleet_owner_capacity_story(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_driver_fleet_owner(v_uid) THEN
    RAISE EXCEPTION 'Fleet Owner capability required';
  END IF;

  UPDATE public.posts p
  SET is_active = false
  WHERE p.id = p_post_id
    AND p.organization_id IS NULL
    AND p.type = 'VEHICLE_AVAILABILITY'
    AND p.author_user_id = v_uid
    AND p.is_active = true;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.deactivate_fleet_owner_capacity_story(uuid) IS
  'Phase 3B.1: Fleet Owner takes own capacity Story offline.';

REVOKE ALL ON FUNCTION public.deactivate_fleet_owner_capacity_story(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_fleet_owner_capacity_story(uuid) TO authenticated;

-- ── 7. Organic discover: include FO capacity in Business network feed ─────
-- Existing Stories surface for Give Load / capacity discovery. No Boost.
CREATE OR REPLACE FUNCTION public.get_network_feed(
  p_org_id uuid,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  org_name text,
  org_avatar_seed text,
  org_avatar_url text,
  author_user_id uuid,
  type text,
  content text,
  origin text,
  destination text,
  load_date date,
  vehicle_type text,
  weight_tonnes numeric,
  rate_offer numeric,
  material text,
  expires_at timestamp with time zone,
  is_active boolean,
  view_count integer,
  bid_count bigint,
  created_at timestamp with time zone,
  source_indent_id uuid,
  is_sponsored boolean,
  reach_campaign_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM (
    -- Branch A: live org posts (+ Reach-targeted). Indent-linked LOAD follows indent lifecycle.
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

    -- Branch A2: organic Fleet Owner capacity (no org, no Boost).
    SELECT
      p.id,
      NULL::uuid AS organization_id,
      'Fleet availability'::text AS org_name,
      NULL::text AS org_avatar_seed,
      NULL::text AS org_avatar_url,
      p.author_user_id,
      p.type,
      p.content,
      p.origin,
      p.destination,
      p.load_date,
      p.vehicle_type,
      p.weight_tonnes,
      p.rate_offer,
      p.material,
      p.expires_at,
      p.is_active,
      p.view_count,
      0::bigint AS bid_count,
      p.created_at,
      NULL::uuid AS source_indent_id,
      false AS is_sponsored,
      NULL::uuid AS reach_campaign_id
    FROM public.posts p
    WHERE p.organization_id IS NULL
      AND upper(coalesce(p.type, '')) = 'VEHICLE_AVAILABILITY'
      AND p.is_active = true
      AND (p.expires_at IS NULL OR p.expires_at > now())

    UNION ALL

    -- Branch B: snapshot-served campaigns (source story deleted/deactivated).
    SELECT
      COALESCE(rc.post_id, rc.id) AS id, rc.org_id AS organization_id,
      o.name AS org_name, o.avatar_seed AS org_avatar_seed, o.logo_url AS org_avatar_url,
      rc.created_by AS author_user_id,
      COALESCE(rc.snapshot_post_type, 'UPDATE') AS type,
      rc.snapshot_content AS content, rc.snapshot_origin AS origin, rc.snapshot_destination AS destination,
      NULL::date AS load_date, rc.snapshot_vehicle_type AS vehicle_type, NULL::numeric AS weight_tonnes,
      rc.snapshot_rate_offer AS rate_offer, rc.snapshot_material AS material,
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
    LEFT JOIN public.indents ind ON ind.id = COALESCE(
      rc.snapshot_source_indent_id,
      (SELECT p3.source_indent_id FROM public.posts p3 WHERE p3.id = rc.post_id)
    )
    WHERE rc.status = 'active'
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
      AND (
        ind.id IS NULL
        OR public.indent_open_for_marketplace_bids(ind.id)
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
  'Network Stories feed: org posts + connections + Reach targets, plus organic Fleet Owner VEHICLE_AVAILABILITY capacity Stories (Phase 3B.1).';
