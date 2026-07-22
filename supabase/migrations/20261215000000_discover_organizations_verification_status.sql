-- Expose KYC verification_status on discover_organizations so grow/home cards
-- can show Verified + Recommended without relying solely on partner-display enrichment.

DROP FUNCTION IF EXISTS public.discover_organizations(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.discover_organizations(
  p_org_id   uuid,
  p_search   text DEFAULT '',
  p_limit    int  DEFAULT 20,
  p_offset   int  DEFAULT 0
)
RETURNS TABLE (
  id                    uuid,
  name                  text,
  avatar_seed           text,
  connection_status     text,
  address_line          text,
  city                  text,
  state                 text,
  profile_role          text,
  operating_model       text,
  mutual_count          int,
  average_rating        numeric(3, 2),
  trip_count            int,
  lane_overlap_count    int,
  recommendation_score  int,
  is_in_user_trip_city  boolean,
  verification_status   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Access denied for organization %', p_org_id;
  END IF;

  RETURN QUERY
  WITH
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
  user_cities AS (
    SELECT DISTINCT public.discover_extract_city(loc) AS city
    FROM (
      SELECT i.pickup_area AS loc
      FROM public.indents i
      WHERE i.organization_id = p_org_id
        AND i.deleted_at IS NULL
      UNION ALL
      SELECT i.drop_location
      FROM public.indents i
      WHERE i.organization_id = p_org_id
        AND i.deleted_at IS NULL
    ) indent_locs
    WHERE public.discover_extract_city(loc) IS NOT NULL
  ),
  post_lane_cities AS (
    SELECT
      p.organization_id AS org_id,
      public.discover_extract_city(p.origin) AS city
    FROM public.posts p
    WHERE p.is_active = true
      AND p.type = 'LOAD'
      AND p.origin IS NOT NULL
    UNION
    SELECT
      p.organization_id,
      public.discover_extract_city(p.destination)
    FROM public.posts p
    WHERE p.is_active = true
      AND p.type = 'LOAD'
      AND p.destination IS NOT NULL
  ),
  candidate_post_cities AS (
    SELECT plc.org_id, array_agg(DISTINCT plc.city) AS cities
    FROM post_lane_cities plc
    WHERE plc.city IS NOT NULL
    GROUP BY plc.org_id
  ),
  base_candidates AS (
    SELECT
      o.id,
      o.name,
      NULLIF(trim(o.address_line), '') AS address_line,
      NULLIF(trim(o.city), '') AS city,
      NULLIF(trim(o.state), '') AS state,
      lower(coalesce(p.role, 'user')) AS profile_role,
      NULLIF(trim(o.operating_model), '') AS operating_model,
      COALESCE(cr.status, 'none') AS connection_status,
      o.verification_status::text AS verification_status
    FROM public.organizations o
    LEFT JOIN public.profiles p ON p.id = o.owner_id
    LEFT JOIN public.connection_requests cr ON (
      (cr.from_organization_id = p_org_id AND cr.to_organization_id = o.id)
      OR (cr.to_organization_id = p_org_id AND cr.from_organization_id = o.id)
    )
    WHERE o.id <> p_org_id
      AND o.deleted_at IS NULL
      AND coalesce(lower(p.role), 'user') <> 'driver'
      AND COALESCE(cr.status, 'none') <> 'approved'
      AND (
        coalesce(trim(p_search), '') = ''
        OR o.name ILIKE '%' || trim(p_search) || '%'
      )
  ),
  enriched AS (
    SELECT
      bc.*,
      (
        SELECT count(*)::int
        FROM user_peers up
        WHERE EXISTS (
          SELECT 1
          FROM public.connection_requests cr2
          WHERE cr2.status = 'approved'
            AND (
              (cr2.from_organization_id = up.peer_org_id AND cr2.to_organization_id = bc.id)
              OR (cr2.from_organization_id = bc.id AND cr2.to_organization_id = up.peer_org_id)
            )
        )
      ) AS mutual_count,
      (
        SELECT round(avg(r.score)::numeric, 2)::numeric(3, 2)
        FROM public.ratings r
        WHERE r.organization_id = p_org_id
          AND (
            r.rated_id = bc.id
            OR r.rated_id IN (
              SELECT c.id
              FROM public.clients c
              WHERE c.organization_id = p_org_id
                AND c.linked_organization_id = bc.id
                AND c.deleted_at IS NULL
            )
            OR r.rated_id IN (
              SELECT s.id
              FROM public.suppliers s
              WHERE s.organization_id = p_org_id
                AND s.linked_organization_id = bc.id
                AND s.deleted_at IS NULL
            )
          )
      ) AS average_rating,
      coalesce(
        (
          SELECT count(*)::int
          FROM public.trips t
          INNER JOIN public.clients c ON c.id = t.client_id
          WHERE t.organization_id = p_org_id
            AND t.deleted_at IS NULL
            AND c.organization_id = p_org_id
            AND c.linked_organization_id = bc.id
            AND c.deleted_at IS NULL
        ),
        (
          SELECT count(*)::int
          FROM public.trips t
          INNER JOIN public.suppliers s ON s.id = t.supplier_id
          WHERE t.organization_id = p_org_id
            AND t.deleted_at IS NULL
            AND s.organization_id = p_org_id
            AND s.linked_organization_id = bc.id
            AND s.deleted_at IS NULL
        ),
        (
          SELECT count(*)::int
          FROM public.trips t
          WHERE t.organization_id = bc.id
            AND t.deleted_at IS NULL
        ),
        0
      ) AS trip_count,
      (
        SELECT count(*)::int
        FROM unnest(coalesce(cpc.cities, ARRAY[]::text[])) AS cc(city)
        WHERE cc.city IN (SELECT uc.city FROM user_cities uc)
      ) AS lane_overlap_count,
      (
        public.discover_extract_city(bc.city) IN (SELECT uc.city FROM user_cities uc)
      ) AS org_city_in_user_lanes
    FROM base_candidates bc
    LEFT JOIN candidate_post_cities cpc ON cpc.org_id = bc.id
  ),
  scored AS (
    SELECT
      e.*,
      CASE
        WHEN e.mutual_count > 0 OR e.lane_overlap_count > 0 OR e.org_city_in_user_lanes THEN
          (CASE WHEN e.mutual_count > 0 THEN 2 ELSE 0 END)
          + (CASE WHEN e.lane_overlap_count >= 1 OR e.org_city_in_user_lanes THEN 2 ELSE 0 END)
          + (CASE WHEN e.lane_overlap_count >= 2 THEN 1 ELSE 0 END)
        ELSE -1
      END AS recommendation_score,
      (e.lane_overlap_count >= 1 OR e.org_city_in_user_lanes) AS is_in_user_trip_city
    FROM enriched e
  )
  SELECT
    s.id,
    s.name,
    NULL::text AS avatar_seed,
    s.connection_status,
    s.address_line,
    s.city,
    s.state,
    s.profile_role,
    s.operating_model,
    s.mutual_count,
    s.average_rating,
    s.trip_count,
    s.lane_overlap_count,
    s.recommendation_score,
    s.is_in_user_trip_city,
    s.verification_status
  FROM scored s
  ORDER BY
    s.recommendation_score DESC,
    CASE
      WHEN s.recommendation_score >= 4 THEN 0
      ELSE abs(hashtext(s.id::text || statement_timestamp()::text))
    END DESC,
    s.mutual_count DESC,
    s.is_in_user_trip_city DESC,
    s.trip_count DESC,
    s.average_rating DESC NULLS LAST,
    s.name ASC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 20), 100))
  OFFSET GREATEST(0, coalesce(p_offset, 0));
END;
$$;

COMMENT ON FUNCTION public.discover_organizations(uuid, text, integer, integer) IS
  'Discover orgs outside network with recommendation scoring and KYC verification_status. SECURITY DEFINER.';

REVOKE ALL ON FUNCTION public.discover_organizations(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discover_organizations(uuid, text, integer, integer) TO authenticated, service_role;
