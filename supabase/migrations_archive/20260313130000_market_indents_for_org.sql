-- RPC: market_indents_for_org(org_id)
-- Returns indents from partner shipper orgs visible to the caller org (integrated supplier / Find Work).
-- Partner orgs: from organization_relations (client_supplier + supplier_client, active); fallback from suppliers (linked_organization_id = org_id).
-- No status filter so open and pending loads both show. SECURITY DEFINER so we can read across orgs.

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
DECLARE
  partner_ids uuid[];
BEGIN
  IF NOT public.is_org_member(org_id) THEN
    RETURN;
  END IF;

  -- Partner shipper orgs: client_supplier (to_org = us → from_org is shipper); supplier_client (from_org = us → to_org is shipper)
  SELECT COALESCE(
    array_agg(DISTINCT pid) FILTER (WHERE pid IS NOT NULL),
    ARRAY[]::uuid[]
  ) INTO partner_ids
  FROM (
    SELECT r.from_organization_id AS pid
    FROM public.organization_relations r
    WHERE r.to_organization_id = market_indents_for_org.org_id
      AND r.relation_type = 'client_supplier'
      AND r.status = 'active'
    UNION ALL
    SELECT r.to_organization_id AS pid
    FROM public.organization_relations r
    WHERE r.from_organization_id = market_indents_for_org.org_id
      AND r.relation_type = 'supplier_client'
      AND r.status = 'active'
  ) sub;

  -- Fallback: orgs that have this org as integrated supplier (suppliers.linked_organization_id = us)
  IF array_length(partner_ids, 1) IS NULL OR array_length(partner_ids, 1) = 0 THEN
    SELECT COALESCE(array_agg(DISTINCT s.organization_id) FILTER (WHERE s.organization_id IS NOT NULL AND s.organization_id != market_indents_for_org.org_id), ARRAY[]::uuid[])
    INTO partner_ids
    FROM public.suppliers s
    WHERE s.linked_organization_id = market_indents_for_org.org_id;
  END IF;

  IF array_length(partner_ids, 1) IS NULL OR array_length(partner_ids, 1) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
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
  WHERE i.organization_id = ANY(partner_ids)
    AND i.circulation_target IN ('integrated_supplier', 'both')
  ORDER BY i.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.market_indents_for_org(uuid) IS
  'Find Work: indents from partner shipper orgs (organization_relations or suppliers fallback). circulation_target in (integrated_supplier, both). No status filter.';

REVOKE ALL ON FUNCTION public.market_indents_for_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.market_indents_for_org(uuid) TO authenticated;
