-- Add `weight` to market_indents_for_org + quoted_indents_for_org.
--
-- Why: both RPCs returned vehicle_type / load_type / pickup_date but omitted
-- `weight`. Suppliers are not members of the shipper's org, so indents RLS
-- blocks a direct table read and every supplier-side indent row comes from one
-- of these two functions. `weight` therefore arrived undefined on the client,
-- seedDeployWeightTonsFromIndent() returned "", and the Tons field on the
-- Deploy Load modal (step 3) rendered empty even though the indent had a
-- weight set. The shipper never saw the bug because their own read path hits
-- public.indents directly and gets all columns.
--
-- Not a new disclosure: weight is already visible to the shipper's own org, and
-- cargo weight is operational information the awarded supplier needs in order
-- to move the load (it drives vehicle suitability and tonnage-based pricing).
-- client_name masking in quoted_indents_for_org is left exactly as-is.
--
-- Column is appended LAST in the RETURNS TABLE list so existing positional
-- consumers keep their current offsets. Both bodies are otherwise byte-for-byte
-- the prior definitions; the only change is the added i.weight projection.
--
-- CREATE OR REPLACE cannot change a function's declared result type, so each
-- function is dropped first. Both are recreated in the same transaction, so
-- there is no window where they are missing.

DROP FUNCTION IF EXISTS public.market_indents_for_org(uuid);

CREATE FUNCTION public.market_indents_for_org(org_id uuid)
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
AS $$
  WITH
  -- Guard: return zero rows if the caller is not a member of org_id.
  -- Evaluated once as a scalar; the planner short-circuits all downstream CTEs.
  guard AS (
    SELECT is_org_member(org_id) AS ok
  ),
  raw_relations AS (
    SELECT r.from_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.to_organization_id = org_id
      AND r.relation_type = 'client_supplier'
      AND r.status = 'active'
    UNION ALL
    SELECT r.to_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.from_organization_id = org_id
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
    WHERE s.linked_organization_id = org_id
      AND s.organization_id IS NOT NULL
      AND s.organization_id <> org_id
    GROUP BY s.organization_id
  ),
  client_org_links AS (
    SELECT c.linked_organization_id AS shipper_org_id, MIN(c.created_at) AS link_since
    FROM public.clients c
    WHERE c.organization_id = org_id
      AND c.status = 'active'
      AND c.linked_organization_id IS NOT NULL
      AND c.linked_organization_id <> org_id
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
      AND i.circulation_target IN ('integrated_supplier', 'both')
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
      AND i.organization_id <> org_id
      AND (
        i.assigned_supplier_id = org_id
        OR EXISTS (
          SELECT 1
          FROM public.direct_quotes dq
          WHERE dq.indent_id = i.id
            AND dq.bidder_organization_id = org_id
            AND dq.status = 'accepted'
        )
      )
  )
  SELECT x.*
  FROM (
    SELECT * FROM via_link
    UNION
    SELECT * FROM via_award
  ) x
  WHERE (SELECT ok FROM guard)
  ORDER BY x.created_at DESC;
$$;

DROP FUNCTION IF EXISTS public.quoted_indents_for_org(uuid);

CREATE FUNCTION public.quoted_indents_for_org(org_id uuid)
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
AS $$
  SELECT
    i.id, i.organization_id, i.indent_number, i.pickup_area, i.drop_location,
    NULL::text AS client_name, i.client_price, i.supplier_target, i.status,
    i.vehicle_type, i.load_type, i.pickup_date, i.circulation_target,
    i.created_at, i.updated_at, o.name AS creator_organization_name,
    i.assigned_supplier_id, i.assigned_supplier_rate, i.weight
  FROM public.indents i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE is_org_member(org_id)
    AND i.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM public.direct_quotes dq
      WHERE dq.indent_id = i.id AND dq.bidder_organization_id = org_id
    );
$$;

-- DROP FUNCTION discards the ACL (unlike CREATE OR REPLACE, which preserves it),
-- so the grants must be restored explicitly or every supplier-side indent read
-- fails with "permission denied for function". These match the pre-migration
-- ACL exactly: EXECUTE for anon, authenticated, and service_role.
GRANT EXECUTE ON FUNCTION public.market_indents_for_org(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quoted_indents_for_org(uuid) TO anon, authenticated, service_role;
