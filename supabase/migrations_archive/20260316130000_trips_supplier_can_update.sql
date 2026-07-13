-- Allow supplier org to UPDATE trips where they are the supplier (trips.supplier_id -> suppliers.linked_organization_id = user's org).
-- Needed so the supplier can assign/reassign driver and vehicle (including vehicle_display_number) from trip detail (Mission Control Blueprint)
-- after an aggregate trip is created from Load Hub / Staff Handshake.

CREATE POLICY "Supplier org can update trips where they are the supplier"
  ON public.trips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = trips.supplier_id
        AND s.linked_organization_id IS NOT NULL
        AND s.linked_organization_id IN (
          SELECT om.organization_id FROM public.organization_members om
          WHERE om.user_id = auth.uid() AND om.status = 'active'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = trips.supplier_id
        AND s.linked_organization_id IS NOT NULL
        AND s.linked_organization_id IN (
          SELECT om.organization_id FROM public.organization_members om
          WHERE om.user_id = auth.uid() AND om.status = 'active'
        )
    )
  );

COMMENT ON POLICY "Supplier org can update trips where they are the supplier" ON public.trips IS
  'Supplier can update assignment (driver_id, vehicle_id, vehicle_display_number) on trips they supply.';
