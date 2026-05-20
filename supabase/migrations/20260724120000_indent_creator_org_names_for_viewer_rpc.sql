-- Client-side chat bootstrap enrich: resolve shipper / indent-owner org name by trip_number
-- for the supplier mirror trip (RLS blocks reading the peer trip row with supabase-js).
-- Used when conversation rows omit indent_creator_organization_name.

CREATE OR REPLACE FUNCTION public.indent_creator_org_names_for_viewer(
  p_viewer_org uuid,
  p_trip_numbers text[]
)
RETURNS TABLE (
  trip_number text,
  creator_org_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (t.trip_number)
    t.trip_number::text,
    o.name::text AS creator_org_name
  FROM public.trips t
  JOIN public.indents i ON i.id = t.indent_id
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE t.trip_number = ANY(p_trip_numbers)
    AND t.indent_id IS NOT NULL
    AND i.organization_id IS DISTINCT FROM p_viewer_org
    AND public.is_org_member(p_viewer_org)
  ORDER BY t.trip_number, t.created_at DESC;
$$;

COMMENT ON FUNCTION public.indent_creator_org_names_for_viewer(uuid, text[]) IS
  'For chat UI: map trip_number -> indent owner org name for rows where indent owner is not the viewer org (supplier sees shipper).';

REVOKE ALL ON FUNCTION public.indent_creator_org_names_for_viewer(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.indent_creator_org_names_for_viewer(uuid, text[]) TO authenticated;
