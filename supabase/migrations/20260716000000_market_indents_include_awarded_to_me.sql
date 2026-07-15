-- Fix: awarded loads invisible to the awardee org in Load Center.
--
-- Root cause: market_indents_for_org filtered indents strictly by partner-link direction
-- (organization_relations with relation_type in (client_supplier, supplier_client), or
-- suppliers.linked_organization_id = caller). When a load was awarded via a Pulse story
-- (posts) or through a suppliers row in the reverse direction (caller had the shipper
-- registered as their supplier, but not vice versa), the RPC excluded the indent even
-- though indents.assigned_supplier_id and direct_quotes.status = 'accepted' both pointed
-- at the caller org. LoadCenterView builds awardedLoads by intersecting marketIndents with
-- awardedToMeIndentIds, so the awarded card never rendered on the awardee side.
--
-- Fix: union the partner-link path with an "awarded to me" path that surfaces any indent
-- where the caller is the assigned supplier or has an accepted direct_quote, regardless of
-- circulation_target or partner-link direction.

CREATE OR REPLACE FUNCTION public.market_indents_for_org(org_id uuid)
RETURNS TABLE (
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
  created_at timestamptz,
  updated_at timestamptz,
  creator_organization_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(org_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH raw_relations AS (
    SELECT r.from_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.to_organization_id = market_indents_for_org.org_id
      AND r.relation_type = 'client_supplier'
      AND r.status = 'active'
    UNION ALL
    SELECT r.to_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.from_organization_id = market_indents_for_org.org_id
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
    WHERE s.linked_organization_id = market_indents_for_org.org_id
      AND s.organization_id IS NOT NULL
      AND s.organization_id <> market_indents_for_org.org_id
    GROUP BY s.organization_id
  ),
  effective_links AS (
    SELECT pl.shipper_org_id, pl.link_since
    FROM partner_links pl
    UNION ALL
    SELECT fl.shipper_org_id, fl.link_since
    FROM fallback_links fl
    WHERE NOT EXISTS (SELECT 1 FROM partner_links)
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
      o.name::text AS creator_organization_name
    FROM public.indents i
    JOIN public.organizations o ON o.id = i.organization_id
    JOIN effective_links e ON e.shipper_org_id = i.organization_id
      AND i.created_at >= e.link_since
    WHERE i.circulation_target IN ('integrated_supplier', 'both')
      AND i.status <> 'draft'
  ),
  via_award AS (
    -- Awarded to me: ensure the awardee always sees the indent, even when the load
    -- arrived via Pulse story or the partner-link is only modeled in the reverse direction.
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
      o.name::text AS creator_organization_name
    FROM public.indents i
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE i.status <> 'draft'
      AND i.organization_id <> market_indents_for_org.org_id
      AND (
        i.assigned_supplier_id = market_indents_for_org.org_id
        OR EXISTS (
          SELECT 1
          FROM public.direct_quotes dq
          WHERE dq.indent_id = i.id
            AND dq.bidder_organization_id = market_indents_for_org.org_id
            AND dq.status = 'accepted'
        )
      )
  )
  SELECT * FROM via_link
  UNION
  SELECT * FROM via_award
  ORDER BY created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.market_indents_for_org(uuid) IS
  'Find Work / Load Center: indents from partner shipper orgs after the client<->supplier link became active (organization_relations or suppliers fallback), plus any indent awarded to the caller (assigned_supplier_id or accepted direct_quote). circulation_target filter applies only to the partner-link branch; awards bypass it so awardees can always see their loads. Excludes draft.';
