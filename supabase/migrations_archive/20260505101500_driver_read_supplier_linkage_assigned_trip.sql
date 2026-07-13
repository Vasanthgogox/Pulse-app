-- Allow assigned drivers (possibly from another org) to read supplier rows and
-- supplier-attributed transactions for trips they drive, so client-side
-- validateSupplierLinkForCompletion can succeed under RLS.

CREATE POLICY "Drivers can read suppliers linked to assigned trips"
  ON public.suppliers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = auth.uid()
      WHERE t.supplier_id = suppliers.id
    )
  );

CREATE POLICY "Drivers can read supplier transactions for assigned trips"
  ON public.transactions
  FOR SELECT
  USING (
    transactions.contact_type = 'supplier'
    AND EXISTS (
      SELECT 1
      FROM public.trips t
      INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = auth.uid()
      WHERE t.id = transactions.trip_id
    )
  );

COMMENT ON POLICY "Drivers can read suppliers linked to assigned trips" ON public.suppliers IS
  'Cross-org aggregate trips: driver JWT is not org_member(trip.organization_id); still need to resolve supplier_id for completion validation.';

COMMENT ON POLICY "Drivers can read supplier transactions for assigned trips" ON public.transactions IS
  'Same as suppliers policy: completion validation falls back to supplier contact_type transactions.';
