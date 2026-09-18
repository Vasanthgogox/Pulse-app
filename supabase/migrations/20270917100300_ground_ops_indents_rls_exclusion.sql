-- Ground Ops must not see indents at all (confirmed product decision —
-- this role's job is document upload on assigned-warehouse trips, nothing
-- else).
--
-- Gap: is_org_staff()'s role array includes 'member', and
-- orgMemberRoleForPlatformRole maps ground_ops -> organization_members.role
-- = 'member' (see features/organization/utils/teamInviteRoles.util.ts). So
-- the existing "Org members can manage indents" policy (is_org_staff-gated)
-- already grants ground_ops full indents access — is_org_staff has no way
-- to see the finer-grained permissions.platformRole. Add an explicit
-- exclusion.

BEGIN;

DROP POLICY IF EXISTS "Org members can manage indents" ON public.indents;

CREATE POLICY "Org members can manage indents" ON public.indents AS PERMISSIVE FOR ALL TO public
  USING (
    is_org_staff(organization_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = indents.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
    )
  )
  WITH CHECK (
    is_org_staff(organization_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = indents.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
    )
  );

COMMIT;
