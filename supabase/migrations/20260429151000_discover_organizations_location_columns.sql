-- Extend discover_organizations to return org address fields so Discover cards can show location.
-- organizations.city/state/address_line added in 20260428120000_org_address_zone_fields.sql
--
-- Postgres forbids CREATE OR REPLACE when OUT/RETURNS TABLE shape changes; drop first.

DROP FUNCTION IF EXISTS public.discover_organizations(UUID, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.discover_organizations(
  p_org_id   UUID,
  p_search   TEXT DEFAULT '',
  p_limit    INT  DEFAULT 20,
  p_offset   INT  DEFAULT 0
)
RETURNS TABLE (
  id                   UUID,
  name                 TEXT,
  avatar_seed          TEXT,
  connection_status    TEXT,
  address_line         TEXT,
  city                 TEXT,
  state                TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id,
    o.name,
    NULL::TEXT         AS avatar_seed,
    COALESCE(cr.status, 'none') AS connection_status,
    NULLIF(trim(o.address_line), ''),
    NULLIF(trim(o.city), ''),
    NULLIF(trim(o.state), '')
  FROM public.organizations o
  LEFT JOIN public.connection_requests cr ON (
    (cr.from_organization_id = p_org_id AND cr.to_organization_id = o.id)
    OR
    (cr.to_organization_id = p_org_id AND cr.from_organization_id = o.id)
  )
  WHERE o.id <> p_org_id
    AND (p_search = '' OR o.name ILIKE '%' || p_search || '%')
  ORDER BY
    CASE COALESCE(cr.status, 'none')
      WHEN 'approved' THEN 1
      WHEN 'pending'  THEN 2
      ELSE 3
    END,
    o.name ASC
  LIMIT p_limit OFFSET p_offset;
$$;
