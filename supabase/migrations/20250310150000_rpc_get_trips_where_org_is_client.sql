-- RPC to fetch trips where the given org is the client (via clients.linked_organization_id).
-- Needed because clients table RLS only lets an org see its own clients; the client row that
-- represents "Mukunt" lives in Nihas's org, so Mukunt's user can't see it. This RPC runs with
-- SECURITY DEFINER, verifies the caller is a member of p_org_id, then returns manual trips
-- where the trip's client has linked_organization_id = p_org_id (Compare & Verify).

CREATE OR REPLACE FUNCTION public.get_trips_where_org_is_client(p_org_id uuid)
RETURNS SETOF public.trips
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.*
  FROM public.trips t
  JOIN public.clients c ON c.id = t.client_id
  WHERE c.linked_organization_id = p_org_id
    AND t.indent_id IS NOT NULL
    AND public.is_org_member(p_org_id)
  ORDER BY t.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_trips_where_org_is_client(uuid) IS
  'Returns load-based trips where the client represents p_org_id (linked_organization_id). Caller must be member of p_org_id. Used for Compare & Verify.';

GRANT EXECUTE ON FUNCTION public.get_trips_where_org_is_client(uuid) TO authenticated;
