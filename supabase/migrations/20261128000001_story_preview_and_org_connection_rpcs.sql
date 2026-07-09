-- Public, non-commercial preview of a single post for the story-detail share link.
-- Callable by anon so an external share link can render a preview card before sign-in.
-- Deliberately excludes rate_offer, weight_tonnes, material, content, author_user_id.
CREATE OR REPLACE FUNCTION public.get_story_preview(p_post_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  org_name text,
  type text,
  origin text,
  destination text,
  load_date date,
  vehicle_type text,
  expires_at timestamptz,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.organization_id, o.name AS org_name, p.type, p.origin, p.destination,
    p.load_date, p.vehicle_type, p.expires_at, p.is_active
  FROM public.posts p
  JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = p_post_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_story_preview(uuid) TO anon, authenticated;

-- Reusable "are these two orgs connected" check, extracted from get_network_feed's
-- inline connection_requests union so other callers (e.g. story-detail) don't
-- need the full feed RPC just to check connection status.
CREATE OR REPLACE FUNCTION public.are_orgs_connected(p_org_a uuid, p_org_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_org_a = p_org_b
    OR EXISTS (
      SELECT 1 FROM public.connection_requests cr
      WHERE cr.status = 'approved'
        AND (
          (cr.from_organization_id = p_org_a AND cr.to_organization_id = p_org_b)
          OR (cr.from_organization_id = p_org_b AND cr.to_organization_id = p_org_a)
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.are_orgs_connected(uuid, uuid) TO authenticated;
