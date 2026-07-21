-- Allow trip creators to read office/warehouse locations of an integrated
-- client's linked organization (organization_locations is otherwise org-member only).

CREATE OR REPLACE FUNCTION public.get_linked_client_org_locations(
  p_org_id uuid,
  p_client_id uuid
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  name text,
  location_type text,
  department text,
  address_line text,
  city text,
  state text,
  is_verified boolean,
  sort_order int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked_org uuid;
BEGIN
  IF p_org_id IS NULL OR p_client_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT c.linked_organization_id
    INTO v_linked_org
  FROM public.clients c
  WHERE c.id = p_client_id
    AND c.organization_id = p_org_id
    AND c.status = 'active'
  LIMIT 1;

  IF v_linked_org IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ol.id,
    ol.organization_id,
    ol.name,
    ol.location_type,
    ol.department,
    ol.address_line,
    ol.city,
    ol.state,
    ol.is_verified,
    ol.sort_order
  FROM public.organization_locations ol
  WHERE ol.organization_id = v_linked_org
  ORDER BY ol.sort_order ASC, ol.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_linked_client_org_locations(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_linked_client_org_locations(uuid, uuid) IS
  'Returns organization_locations for an integrated client''s linked org. Caller must be a member of p_org_id and the client must belong to that org.';
