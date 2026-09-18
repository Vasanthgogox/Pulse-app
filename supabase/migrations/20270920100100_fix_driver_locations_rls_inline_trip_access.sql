-- Fix pool-saturation incident (2026-09-16 09:44-10:41 UTC): "Trip partners read
-- driver locations" on public.driver_locations called can_access_trip_location(trip_id),
-- a STABLE SECURITY DEFINER function, per row. Under driver-location polling load this
-- exhausted the connection pool (57014/25P03/57P05/08006 cascading into 401/503/504
-- app-wide) -- same class of issue as the 2026-09-16 morning get_trip_detail_bundle
-- outage. Fix: inline the predicate directly into the policy's USING clause so RLS
-- no longer invokes a function per row. can_access_trip_location() itself is kept
-- unchanged for RPCs that call it once per invocation (get_latest_driver_location_for_trip,
-- get_driver_location_history_for_trip, get_last_n_locations_for_trip).

DROP POLICY IF EXISTS "Trip partners read driver locations" ON public.driver_locations;

CREATE POLICY "Trip partners read driver locations"
  ON public.driver_locations FOR SELECT
  USING (
    trip_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.trips t
       WHERE t.id = driver_locations.trip_id
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
