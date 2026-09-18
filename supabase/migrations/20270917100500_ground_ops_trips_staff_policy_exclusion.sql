-- Post-push fix part 2: "Org members can manage trips" granted ground_ops
-- full trip access via is_org_staff (role = member). PERMISSIVE OR with
-- trips_ground_ops_select_assigned meant direct .from('trips') bypassed
-- warehouse scoping. Split from 20270917100400 to avoid lock timeout coupling
-- with function replacements.

BEGIN;

DROP POLICY IF EXISTS "Org members can manage trips" ON public.trips;

CREATE POLICY "Org members can manage trips" ON public.trips AS PERMISSIVE FOR ALL TO authenticated
  USING (
    public.is_org_staff(organization_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = trips.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
        AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
    )
  )
  WITH CHECK (
    public.is_org_staff(organization_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = trips.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
        AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
    )
  );

COMMIT;
