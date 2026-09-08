-- Marketplace Find Work cards should use the same shipper avatar as Reach
-- stories (organizations.logo_url, then avatar_seed). Drivers cannot read
-- organizations directly, so the existing SECURITY DEFINER list RPC must
-- project those fields. DROP is required: RETURNS TABLE column set changes.

DROP FUNCTION IF EXISTS public.list_open_marketplace_loads_for_fleet_owner(integer);

CREATE FUNCTION public.list_open_marketplace_loads_for_fleet_owner(
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  indent_number text,
  pickup_area text,
  drop_location text,
  vehicle_type text,
  load_type text,
  pickup_date date,
  status text,
  circulation_target text,
  rate_offer numeric,
  creator_organization_name text,
  created_at timestamptz,
  creator_organization_id uuid,
  creator_organization_logo_url text,
  creator_organization_avatar_seed text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_role IS DISTINCT FROM 'driver' THEN
    RAISE EXCEPTION 'Only drivers can list fleet-owner marketplace loads';
  END IF;

  IF NOT public.is_driver_fleet_owner(v_uid) THEN
    RAISE EXCEPTION 'Fleet Owner capability required';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.indent_number,
    i.pickup_area,
    i.drop_location,
    i.vehicle_type,
    i.load_type,
    i.pickup_date,
    i.status::text,
    i.circulation_target::text,
    i.supplier_target::numeric AS rate_offer,
    o.name AS creator_organization_name,
    i.created_at,
    o.id AS creator_organization_id,
    o.logo_url AS creator_organization_logo_url,
    o.avatar_seed AS creator_organization_avatar_seed
  FROM public.indents i
  LEFT JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.deleted_at IS NULL
    AND public.indent_open_for_marketplace_bids(i.id)
    AND lower(trim(coalesce(i.circulation_target, ''))) IN ('marketplace', 'both')
  ORDER BY i.created_at DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_open_marketplace_loads_for_fleet_owner(integer) IS
  'Phase 3A: sanitized open marketplace/both indents for Driver App Fleet Owners. Includes shipper logo/seed for the same PartyAvatar path as Reach stories.';

REVOKE ALL ON FUNCTION public.list_open_marketplace_loads_for_fleet_owner(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_open_marketplace_loads_for_fleet_owner(integer) TO authenticated;
