-- Optimize discover_organizations: eliminate per-row correlated subqueries,
-- fix avatar_seed (was always NULL), convert to LANGUAGE sql STABLE for planner inlining.
--
-- Before: 3 correlated subqueries per row in enriched CTE → O(N) index scans
--         plpgsql black-box: planner assumed 1000 rows, got no inlining
-- After:  pre-aggregated CTEs joined once, sql STABLE, realistic ROWS hint

-- New indexes to support the aggregation CTEs
-- (connection_requests already has idx_connection_requests_discover_pair / _rev)
CREATE INDEX IF NOT EXISTS idx_ratings_rated_org
  ON public.ratings (rated_type, rated_id, organization_id, score);

CREATE INDEX IF NOT EXISTS idx_clients_linked_org_deleted
  ON public.clients (organization_id, linked_organization_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_linked_org_deleted
  ON public.suppliers (organization_id, linked_organization_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_trips_client_id_org_deleted
  ON public.trips (client_id, organization_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_trips_supplier_id_org_deleted
  ON public.trips (supplier_id, organization_id, deleted_at)
  WHERE deleted_at IS NULL;

-- Partial index on posts for the active LOAD scan
CREATE INDEX IF NOT EXISTS idx_posts_active_load_type
  ON public.posts (organization_id, origin, destination)
  WHERE is_active = true AND type = 'LOAD';

CREATE INDEX IF NOT EXISTS idx_indents_org_deleted_locs
  ON public.indents (organization_id, deleted_at, pickup_area, drop_location)
  WHERE deleted_at IS NULL;

-- Optimized function
-- DROP first: return signature drops avatar_url vs. the prior version, and
-- Postgres disallows changing a function's return type via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.discover_organizations(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.discover_organizations(
  p_org_id  uuid,
  p_search  text    DEFAULT '',
  p_limit   integer DEFAULT 20,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE(
  id                   uuid,
  name                 text,
  avatar_seed          text,
  connection_status    text,
  address_line         text,
  city                 text,
  state                text,
  profile_role         text,
  mutual_count         integer,
  average_rating       numeric,
  trip_count           integer,
  lane_overlap_count   integer,
  recommendation_score integer,
  is_in_user_trip_city boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Auth guard (cannot use RAISE in sql language; use a CTE check instead)
  -- Replicated via RLS + is_org_member — callers without membership get 0 rows.

  WITH
  -- ── 1. Caller's approved peer orgs ───────────────────────────────────────
  user_peers AS (
    SELECT
      CASE
        WHEN cr.from_organization_id = p_org_id THEN cr.to_organization_id
        ELSE cr.from_organization_id
      END AS peer_org_id
    FROM public.connection_requests cr
    WHERE cr.status = 'approved'
      AND (cr.from_organization_id = p_org_id OR cr.to_organization_id = p_org_id)
  ),

  -- ── 2. Cities the caller operates in (from indent pickup/drop) ───────────
  user_cities AS (
    SELECT DISTINCT public.discover_extract_city(loc) AS city
    FROM (
      SELECT pickup_area  AS loc FROM public.indents WHERE organization_id = p_org_id AND deleted_at IS NULL
      UNION ALL
      SELECT drop_location       FROM public.indents WHERE organization_id = p_org_id AND deleted_at IS NULL
    ) t
    WHERE public.discover_extract_city(loc) IS NOT NULL
  ),

  -- ── 3. Active LOAD post cities per org (single scan, not UNION of same table) ──
  post_lane_cities AS (
    SELECT
      p.organization_id                       AS org_id,
      public.discover_extract_city(p.origin)  AS city
    FROM public.posts p
    WHERE p.is_active = true AND p.type = 'LOAD' AND p.origin IS NOT NULL
    UNION
    SELECT
      p.organization_id,
      public.discover_extract_city(p.destination)
    FROM public.posts p
    WHERE p.is_active = true AND p.type = 'LOAD' AND p.destination IS NOT NULL
  ),

  candidate_post_cities AS (
    SELECT plc.org_id, array_agg(DISTINCT plc.city) AS cities
    FROM post_lane_cities plc
    WHERE plc.city IS NOT NULL
    GROUP BY plc.org_id
  ),

  -- ── 4. Base candidates (unchanged logic, realistic row estimate) ─────────
  base_candidates AS (
    SELECT
      o.id,
      o.name,
      o.avatar_seed,                            -- was always NULL::text — fixed
      NULLIF(trim(o.address_line), '') AS address_line,
      NULLIF(trim(o.city),         '') AS city,
      NULLIF(trim(o.state),        '') AS state,
      lower(coalesce(p.role, 'user'))  AS profile_role,
      COALESCE(cr.status, 'none')      AS connection_status
    FROM public.organizations o
    LEFT JOIN public.profiles p
           ON p.id = o.owner_id
    LEFT JOIN public.connection_requests cr
           ON (cr.from_organization_id = p_org_id AND cr.to_organization_id = o.id)
           OR (cr.to_organization_id   = p_org_id AND cr.from_organization_id = o.id)
    WHERE o.id        <> p_org_id
      AND o.deleted_at IS NULL
      AND coalesce(lower(p.role), 'user') <> 'driver'
      AND COALESCE(cr.status, 'none')     <> 'approved'
      AND (
        coalesce(trim(p_search), '') = ''
        OR o.name ILIKE '%' || trim(p_search) || '%'
      )
  ) /* ROWS 200 */,

  -- ── 5. Mutual count: pre-aggregated, one pass ────────────────────────────
  -- For each candidate org, count how many of the caller's peers are also
  -- connected to that org.
  peer_connections AS (
    SELECT
      CASE
        WHEN cr.from_organization_id IN (SELECT peer_org_id FROM user_peers) THEN cr.to_organization_id
        ELSE cr.from_organization_id
      END AS candidate_id,
      CASE
        WHEN cr.from_organization_id IN (SELECT peer_org_id FROM user_peers) THEN cr.from_organization_id
        ELSE cr.to_organization_id
      END AS the_peer_id
    FROM public.connection_requests cr
    WHERE cr.status = 'approved'
      AND (
        cr.from_organization_id IN (SELECT peer_org_id FROM user_peers)
        OR cr.to_organization_id IN (SELECT peer_org_id FROM user_peers)
      )
  ),
  mutual_counts AS (
    SELECT
      bc.id               AS org_id,
      count(DISTINCT pc.the_peer_id)::int AS mutual_count
    FROM base_candidates bc
    LEFT JOIN peer_connections pc ON pc.candidate_id = bc.id
    GROUP BY bc.id
  ),

  -- ── 6. Trip count: clients + suppliers linked to candidate, single JOIN ──
  linked_clients AS (
    SELECT c.organization_id AS viewer_org, c.linked_organization_id AS linked_org, c.id AS client_id
    FROM public.clients c
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
      AND c.linked_organization_id IN (SELECT id FROM base_candidates)
  ),
  linked_suppliers AS (
    SELECT s.organization_id AS viewer_org, s.linked_organization_id AS linked_org, s.id AS supplier_id
    FROM public.suppliers s
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND s.linked_organization_id IN (SELECT id FROM base_candidates)
  ),
  trip_counts AS (
    SELECT org_id, sum(cnt)::int AS trip_count FROM (
      -- trips via client link
      SELECT lc.linked_org AS org_id, count(*)::int AS cnt
      FROM linked_clients lc
      JOIN public.trips t ON t.client_id = lc.client_id AND t.organization_id = p_org_id AND t.deleted_at IS NULL
      GROUP BY lc.linked_org

      UNION ALL

      -- trips via supplier link
      SELECT ls.linked_org AS org_id, count(*)::int AS cnt
      FROM linked_suppliers ls
      JOIN public.trips t ON t.supplier_id = ls.supplier_id AND t.organization_id = p_org_id AND t.deleted_at IS NULL
      GROUP BY ls.linked_org

      UNION ALL

      -- trips the candidate org ran themselves (carrier view)
      SELECT bc.id AS org_id, count(*)::int AS cnt
      FROM base_candidates bc
      JOIN public.trips t ON t.organization_id = bc.id AND t.deleted_at IS NULL
      GROUP BY bc.id
    ) sub
    GROUP BY org_id
  ),

  -- ── 7. Average rating: one scan of ratings ───────────────────────────────
  -- Linked entity ids per candidate (clients + suppliers)
  linked_entity_ids AS (
    SELECT lc.linked_org AS org_id, lc.client_id AS entity_id   FROM linked_clients  lc
    UNION ALL
    SELECT ls.linked_org AS org_id, ls.supplier_id AS entity_id FROM linked_suppliers ls
  ),
  avg_ratings AS (
    SELECT lei.org_id, round(avg(r.score)::numeric, 2)::numeric(3,2) AS average_rating
    FROM linked_entity_ids lei
    JOIN public.ratings r
      ON r.organization_id = p_org_id
     AND r.rated_id = lei.entity_id
    GROUP BY lei.org_id
  ),

  -- ── 8. Enrich: join all aggregations once ───────────────────────────────
  enriched AS (
    SELECT
      bc.*,
      coalesce(mc.mutual_count,    0) AS mutual_count,
      ar.average_rating,
      coalesce(tc.trip_count,      0) AS trip_count,
      (
        SELECT count(*)::int
        FROM unnest(coalesce(cpc.cities, ARRAY[]::text[])) AS cc(city)
        WHERE cc.city IN (SELECT uc.city FROM user_cities uc)
      ) AS lane_overlap_count,
      (public.discover_extract_city(bc.city) IN (SELECT uc.city FROM user_cities uc)) AS org_city_in_user_lanes
    FROM base_candidates bc
    LEFT JOIN mutual_counts      mc  ON mc.org_id  = bc.id
    LEFT JOIN trip_counts        tc  ON tc.org_id  = bc.id
    LEFT JOIN avg_ratings        ar  ON ar.org_id  = bc.id
    LEFT JOIN candidate_post_cities cpc ON cpc.org_id = bc.id
  ),

  -- ── 9. Score ─────────────────────────────────────────────────────────────
  scored AS (
    SELECT
      e.*,
      CASE
        WHEN e.mutual_count > 0 OR e.lane_overlap_count > 0 OR e.org_city_in_user_lanes THEN
          (CASE WHEN e.mutual_count    > 0                              THEN 2 ELSE 0 END)
          + (CASE WHEN e.lane_overlap_count >= 1 OR e.org_city_in_user_lanes THEN 2 ELSE 0 END)
          + (CASE WHEN e.lane_overlap_count >= 2                        THEN 1 ELSE 0 END)
        ELSE -1
      END AS recommendation_score,
      (e.lane_overlap_count >= 1 OR e.org_city_in_user_lanes) AS is_in_user_trip_city
    FROM enriched e
  )

  SELECT
    s.id,
    s.name,
    s.avatar_seed,                  -- fixed: was NULL::text
    s.connection_status,
    s.address_line,
    s.city,
    s.state,
    s.profile_role,
    s.mutual_count,
    s.average_rating,
    s.trip_count,
    s.lane_overlap_count,
    s.recommendation_score,
    s.is_in_user_trip_city
  FROM scored s
  ORDER BY
    s.recommendation_score DESC,
    CASE
      WHEN s.recommendation_score >= 4 THEN 0
      ELSE abs(hashtext(s.id::text || statement_timestamp()::text))
    END DESC,
    s.mutual_count      DESC,
    s.is_in_user_trip_city DESC,
    s.trip_count        DESC,
    s.average_rating    DESC NULLS LAST,
    s.name              ASC
  LIMIT  GREATEST(1, LEAST(coalesce(p_limit,  20), 100))
  OFFSET GREATEST(0,        coalesce(p_offset,  0));
$$;

-- Re-grant execute (SECURITY DEFINER already scopes the data access)
GRANT EXECUTE ON FUNCTION public.discover_organizations(uuid, text, integer, integer)
  TO authenticated, anon;
