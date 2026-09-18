-- Follow-up to 20270920100100_fix_driver_locations_rls_inline_trip_access.sql.
-- "Trip partners read checkpoints" on public.trip_location_checkpoints still calls
-- can_access_trip_location(trip_id), a STABLE SECURITY DEFINER function, per row --
-- the same anti-pattern that caused the 2026-09-16 driver_locations pool-saturation
-- incident. trip_location_checkpoints backs the same live-tracking hot path, so it
-- carries the same risk under load even though it wasn't implicated in that incident.
-- Fix: inline the predicate directly into the policy's USING clause. can_access_trip_location()
-- itself is unchanged for callers that invoke it once per call.

DROP POLICY IF EXISTS "Trip partners read checkpoints" ON public.trip_location_checkpoints;

CREATE POLICY "Trip partners read checkpoints"
  ON public.trip_location_checkpoints FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.trips t
       WHERE t.id = trip_location_checkpoints.trip_id
         AND (
           -- Fleet / owner org member
           public.is_org_member(t.organization_id)
           -- Client org: the client entity on this trip links to the caller's org
           OR (
             t.client_id IS NOT NULL
             AND EXISTS (
               SELECT 1
                 FROM public.clients c
                 JOIN public.organization_members om
                   ON om.organization_id = c.linked_organization_id
                  AND om.user_id = (SELECT auth.uid())
                  AND om.status = 'active'
                WHERE c.id = t.client_id
                  AND c.linked_organization_id IS NOT NULL
             )
           )
           -- Supplier org: the supplier entity on this trip links to the caller's org
           OR (
             t.supplier_id IS NOT NULL
             AND EXISTS (
               SELECT 1
                 FROM public.suppliers s
                 JOIN public.organization_members om
                   ON om.organization_id = s.linked_organization_id
                  AND om.user_id = (SELECT auth.uid())
                  AND om.status = 'active'
                WHERE s.id = t.supplier_id
                  AND s.linked_organization_id IS NOT NULL
             )
           )
         )
    )
  );
