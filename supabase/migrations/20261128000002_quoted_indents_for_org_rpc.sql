-- Fixes mergeQuotedIndentsForSupplier's safety net: it re-fetches indents by id via a
-- plain `.from('indents').select()` call, which RLS ("Org members can manage indents",
-- USING is_org_member(organization_id)) silently blocks for any org that isn't the
-- indent's own org — so a supplier with a direct_quote on a non-partner shipper's indent
-- (e.g. a Pulse story bid) never sees it back on the Load Center "Quoted" tab.
-- This RPC returns, for the calling org's own quoted indents only, the same columns as
-- market_indents_for_org so the two lists can be merged client-side without touching RLS.
CREATE OR REPLACE FUNCTION public.quoted_indents_for_org(org_id uuid)
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
  assigned_supplier_rate numeric
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
    i.assigned_supplier_id, i.assigned_supplier_rate
  FROM public.indents i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE is_org_member(org_id)
    AND i.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM public.direct_quotes dq
      WHERE dq.indent_id = i.id AND dq.bidder_organization_id = org_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.quoted_indents_for_org(uuid) TO authenticated;
