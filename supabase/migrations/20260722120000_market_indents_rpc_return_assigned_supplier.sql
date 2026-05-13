-- Expose assigned_supplier_id / assigned_supplier_rate from market_indents_for_org so
-- Load Center can treat "awarded to me" by assignment, not only by accepted direct_quotes.
--
-- Postgres rejects CREATE OR REPLACE when RETURNS TABLE columns change (42P13); drop first.

DROP FUNCTION IF EXISTS public.market_indents_for_org(uuid);

CREATE FUNCTION public.market_indents_for_org(org_id uuid)
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
  creator_organization_name text,
  assigned_supplier_id uuid,
  assigned_supplier_rate numeric
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
  client_org_links AS (
    SELECT c.linked_organization_id AS shipper_org_id, MIN(c.created_at) AS link_since
    FROM public.clients c
    WHERE c.organization_id = market_indents_for_org.org_id
      AND c.status = 'active'
      AND c.linked_organization_id IS NOT NULL
      AND c.linked_organization_id <> market_indents_for_org.org_id
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
      i.assigned_supplier_rate
    FROM public.indents i
    JOIN public.organizations o ON o.id = i.organization_id
    JOIN effective_links e ON e.shipper_org_id = i.organization_id
      AND i.created_at >= e.link_since
    WHERE i.circulation_target IN ('integrated_supplier', 'both')
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
      i.assigned_supplier_rate
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
  'Find Work / Load Center: partner-link indents plus awarded-to-caller; returns assigned_supplier_id/rate for Claimed UI.';

REVOKE ALL ON FUNCTION public.market_indents_for_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.market_indents_for_org(uuid) TO authenticated;
