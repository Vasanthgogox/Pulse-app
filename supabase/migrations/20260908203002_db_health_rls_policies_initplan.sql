-- Applied on linked project via MCP (20260908203002). Membership set +
-- initplanned has_platform_permission on organizations SELECT.

DROP POLICY IF EXISTS "Users can read orgs they belong to" ON public.organizations;
CREATE POLICY "Users can read orgs they belong to"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid()) AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS organizations_platform_admin_select ON public.organizations;
CREATE POLICY organizations_platform_admin_select ON public.organizations
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_platform_permission((SELECT auth.uid()), 'verification.review'))
    OR (SELECT public.has_platform_permission((SELECT auth.uid()), 'verification.approve'))
    OR (SELECT public.has_platform_permission((SELECT auth.uid()), 'credits.issue'))
  );
