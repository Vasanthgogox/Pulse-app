-- Applied on linked project via MCP (20260908202905). Restore EXECUTE so
-- RLS that calls is_org_member does not 42501 for authenticated/anon.

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(uuid, text) TO authenticated;
