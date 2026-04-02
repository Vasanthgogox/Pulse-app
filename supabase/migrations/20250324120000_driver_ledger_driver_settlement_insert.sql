-- Allow drivers to insert settlement entries for their own ledger (e.g. "Mark as paid" in driver app).
-- RLS previously only allowed: SELECT for drivers, INSERT/UPDATE/DELETE for org members.
-- Required for: driver app Wallet "Mark as paid" to work. Apply this migration if you see
-- "new row violates row-level security policy for table driver_ledger" when marking a trip as paid.

DROP POLICY IF EXISTS "Drivers can insert settlement for own ledger" ON "public"."driver_ledger";
CREATE POLICY "Drivers can insert settlement for own ledger" ON "public"."driver_ledger"
  FOR INSERT
  WITH CHECK (
    type = 'settlement'
    AND EXISTS (
      SELECT 1 FROM "public"."drivers" d
      WHERE d.id = driver_ledger.driver_id AND d.user_id = auth.uid()
    )
  );
