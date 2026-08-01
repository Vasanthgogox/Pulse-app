-- Repair: market_indents_for_org parameter name drift (Get Load returned zero)
--
-- The live function on the linked project is market_indents_for_org(p_org_id uuid)
-- and its body carries a `via_reach` branch (sponsored/reach targets). It came
-- from pulse-unified-base, which shares this Supabase project and pushed
-- `market_indents_via_reach` at version 20270126000000. Repo history here last
-- declared the function as
-- market_indents_for_org(org_id uuid) -- see 20261031000002 -- so the schemas had
-- silently diverged: the client posts { org_id } and PostgREST answers PGRST202
-- ("Could not find the function public.market_indents_for_org(org_id)"), which
-- collapses GET LOAD to zero rows and surfaces the load-board error state.
--
-- This migration adopts the live signature and body as the source of truth so the
-- repo, generated types, and the linked project agree. CREATE OR REPLACE cannot
-- rename an input parameter, so the old signature is dropped first. On the linked
-- project this replays as a no-op; on a fresh `supabase db reset` it produces the
-- function the client actually calls.

DROP FUNCTION IF EXISTS public.market_indents_for_org(uuid);

CREATE OR REPLACE FUNCTION public.market_indents_for_org(p_org_id uuid)
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  indent_number text,
  pickup_area text,
  drop_location text,
  client_name text,
  client_price numeric,
  supplier_target numeric,
  status text,
  vehicle_type text,
  load_type text,
  pickup_date date,
  circulation_target text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  creator_organization_name text,
  assigned_supplier_id uuid,
  assigned_supplier_rate numeric,
  weight numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  -- Guard: return zero rows if the caller is not a member of p_org_id.
  -- Evaluated once as a scalar; the planner short-circuits all downstream CTEs.
  guard AS (
    SELECT is_org_member(p_org_id) AS ok
  ),
  raw_relations AS (
    SELECT r.from_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.to_organization_id = p_org_id
      AND r.relation_type = 'client_supplier'
      AND r.status = 'active'
    UNION ALL
    SELECT r.to_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.from_organization_id = p_org_id
      AND r.relation_type = 'supplier_client'
      AND r.status = 'active'
  ),
  partner_links AS (
    SELECT shipper_org_id, MIN(link_since) AS link_since
    FROM raw_relations
    GROUP BY shipper_org_id
  ),
  fallback_links AS (
    SELECT s.organization_id AS shipper_org_id, MIN(s.updated_at) AS link_since
    FROM public.suppliers s
    WHERE s.linked_organization_id = p_org_id
      AND s.organization_id IS NOT NULL
      AND s.organization_id <> p_org_id
    GROUP BY s.organization_id
  ),
  client_org_links AS (
    SELECT c.linked_organization_id AS shipper_org_id, MIN(c.created_at) AS link_since
    FROM public.clients c
    WHERE c.organization_id = p_org_id
      AND c.status = 'active'
      AND c.linked_organization_id IS NOT NULL
      AND c.linked_organization_id <> p_org_id
    GROUP BY c.linked_organization_id
  ),
  effective_links AS (
    SELECT pl.shipper_org_id, pl.link_since
    FROM partner_links pl
    UNION ALL
    SELECT fl.shipper_org_id, fl.link_since
    FROM fallback_links fl
    WHERE NOT EXISTS (
      SELECT 1 FROM partner_links pl2
      WHERE pl2.shipper_org_id = fl.shipper_org_id
    )
    UNION ALL
    SELECT clo.shipper_org_id, clo.link_since
    FROM client_org_links clo
    WHERE NOT EXISTS (
      SELECT 1 FROM partner_links pl2
      WHERE pl2.shipper_org_id = clo.shipper_org_id
    )
      AND NOT EXISTS (
        SELECT 1 FROM fallback_links fl2
        WHERE fl2.shipper_org_id = clo.shipper_org_id
      )
  ),
  via_link AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.indents i
    JOIN public.organizations o ON o.id = i.organization_id
    JOIN effective_links e ON e.shipper_org_id = i.organization_id
      AND i.created_at >= e.link_since
    WHERE i.deleted_at IS NULL
      -- Treat NULL as 'integrated_supplier' (the createIndent default) so a
      -- missing value fails open rather than hiding the load entirely.
      AND (
        i.circulation_target IS NULL
        OR i.circulation_target IN ('integrated_supplier', 'both')
      )
      AND i.status <> 'draft'
  ),
  via_award AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.indents i
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE i.deleted_at IS NULL
      AND i.status <> 'draft'
      AND i.organization_id <> p_org_id
      AND (
        i.assigned_supplier_id = p_org_id
        OR EXISTS (
          SELECT 1
          FROM public.direct_quotes dq
          WHERE dq.indent_id = i.id
            AND dq.bidder_organization_id = p_org_id
            AND dq.status = 'accepted'
        )
      )
  ),
  -- Sponsored loads the caller was paid-targeted on. Live campaigns admit every
  -- target; expired/archived ones admit only targets that actually bid, so a
  -- pending offer stays reachable through negotiation and award.
  via_reach AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.reach_campaign_targets t
    JOIN public.reach_campaigns c ON c.id = t.campaign_id
    JOIN public.indents i
      ON i.id = COALESCE(
        c.snapshot_source_indent_id,
        (SELECT p.source_indent_id FROM public.posts p WHERE p.id = c.post_id)
      )
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE t.org_id = p_org_id
      AND t.released_at IS NOT NULL
      AND c.archived_at IS NULL
      AND i.deleted_at IS NULL
      AND i.status <> 'draft'
      AND i.organization_id <> p_org_id
      AND (
        (c.status = 'active' AND (c.expires_at IS NULL OR c.expires_at > now()))
        OR EXISTS (
          SELECT 1
          FROM public.direct_quotes dq
          WHERE dq.indent_id = i.id
            AND dq.bidder_organization_id = p_org_id
        )
      )
  )
  SELECT x.*
  FROM (
    SELECT * FROM via_link
    UNION
    SELECT * FROM via_award
    UNION
    SELECT * FROM via_reach
  ) x
  WHERE (SELECT ok FROM guard)
  ORDER BY x.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.market_indents_for_org(uuid) TO authenticated;
