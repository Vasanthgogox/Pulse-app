-- Fix: the initial resolver walked from an upstream org's *newest* indent,
-- regardless of whether that indent was the same physical load. That leaked
-- unrelated orgs into the ancestor set (e.g. H&M, a client on MAX's unrelated
-- Chennai loads, appeared on a Mumbai->Bengaluru chain) and would have blocked
-- innocent carriers.
--
-- Now a hop only continues when the upstream indent plausibly *is* the same
-- load: same route and same pickup date. If no such indent exists, the walk
-- stops at that org rather than guessing. Prefers false negatives (miss a
-- deep loop) over false positives (block legitimate business); the direct
-- cargo-owner and broker hops that matter in practice are still caught.
CREATE OR REPLACE FUNCTION public.get_load_chain_ancestor_orgs(
  p_indent_id uuid,
  p_max_depth int DEFAULT 8
)
RETURNS TABLE(org_id uuid, hop int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE chain AS (
    SELECT
      i.organization_id            AS org_id,
      i.client_name                AS next_client_name,
      i.pickup_area                AS route_pickup,
      i.drop_location              AS route_drop,
      i.pickup_date                AS route_date,
      0                            AS hop,
      ARRAY[i.organization_id]     AS seen
    FROM public.indents i
    WHERE i.id = p_indent_id
      AND i.organization_id IS NOT NULL

    UNION ALL

    SELECT
      c.linked_organization_id,
      up.client_name,
      chain.route_pickup,
      chain.route_drop,
      chain.route_date,
      chain.hop + 1,
      chain.seen || c.linked_organization_id
    FROM chain
    JOIN public.clients c
      ON c.organization_id = chain.org_id
     AND lower(btrim(c.name)) = lower(btrim(chain.next_client_name))
     AND c.deleted_at IS NULL
     AND c.linked_organization_id IS NOT NULL
    -- Continue upward only via an indent that looks like the SAME load.
    LEFT JOIN LATERAL (
      SELECT i2.client_name
      FROM public.indents i2
      WHERE i2.organization_id = c.linked_organization_id
        AND i2.deleted_at IS NULL
        AND lower(btrim(i2.pickup_area))   = lower(btrim(chain.route_pickup))
        AND lower(btrim(i2.drop_location)) = lower(btrim(chain.route_drop))
        AND i2.pickup_date IS NOT DISTINCT FROM chain.route_date
      ORDER BY i2.created_at DESC
      LIMIT 1
    ) up ON TRUE
    WHERE chain.hop < p_max_depth
      AND NOT (c.linked_organization_id = ANY(chain.seen))
  )
  SELECT chain.org_id, MIN(chain.hop) AS hop
  FROM chain
  WHERE chain.org_id IS NOT NULL
  GROUP BY chain.org_id;
$function$;
