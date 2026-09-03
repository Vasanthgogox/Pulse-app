-- Payable-side mirror of trg_sync_trip_payment_status.
--
-- A driver-payable transaction must produce the fleet-side driver_ledger row
-- regardless of which UI path recorded the payment. That sync previously lived
-- only in an app-layer condition (features/finance/hooks/useFinanceTransactionSubmit.ts,
-- gated on `data.driverPaymentType`), so a payment booked under a legacy
-- EXPENSE_CATEGORIES value — e.g. "SUPPLIER PAYMENT" — never set that field and
-- the driver_ledger write was skipped silently. The business side showed the trip
-- paid (trips.payment_status, kept correct by the receivable trigger) while the
-- driver app, which reads driver_ledger, showed it outstanding forever. Found on
-- TRP135: a DCO paid ₹35,000 in full, still displaying "Pending from fleet".
--
-- The receivable side never had this class of bug because it is derived in the DB.
-- This makes the payable side symmetrical.
--
-- Writes type='adjustment' + "Sync: FLEET_PAID_PENDING" — the "fleet marked paid,
-- awaiting driver confirmation" state. It deliberately does NOT write
-- type='settlement': that row means the *driver* confirmed receipt and is written
-- only by the driver (features/driver/hooks/useDriverTripSettlement.ts). Writing it
-- here would forge that confirmation and destroy the receipt audit trail. The data
-- backs the split cleanly — all 19 adjustment rows carry the token, none of the 10
-- settlement rows do.
--
-- Idempotency + audit link use reference_type/reference_id, which already exist.

CREATE OR REPLACE FUNCTION public.sync_driver_ledger_from_transaction()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_desc text;
BEGIN
  -- Drop the mirrored row when the payment is deleted or amended away.
  -- Scoped to rows this trigger authored (reference_type='transaction') so it can
  -- never delete a driver's own confirmation or an app-authored row.
  IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE') THEN
    DELETE FROM public.driver_ledger dl
    WHERE dl.reference_type = 'transaction'
      AND dl.reference_id = OLD.id
      AND dl.type = 'adjustment';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.contact_type <> 'driver'
     OR NEW.ledger_flow_type <> 'payable'
     OR COALESCE(NEW.amount_out, 0) <= 0
     OR NEW.trip_id IS NULL
     OR NEW.contact_id IS NULL
     OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Driver already confirmed receipt for this trip: do not reopen it as pending.
  IF EXISTS (
    SELECT 1 FROM public.driver_ledger dl
    WHERE dl.trip_id = NEW.trip_id
      AND dl.driver_id = NEW.contact_id
      AND dl.type = 'settlement'
  ) THEN
    RETURN NEW;
  END IF;

  -- The app path that already handles this correctly wrote the row; don't duplicate.
  IF EXISTS (
    SELECT 1 FROM public.driver_ledger dl
    WHERE dl.trip_id = NEW.trip_id
      AND dl.driver_id = NEW.contact_id
      AND dl.type = 'adjustment'
      AND dl.amount = NEW.amount_out
      AND (dl.reference_id IS NULL OR dl.reference_id IS DISTINCT FROM NEW.id)
  ) THEN
    RETURN NEW;
  END IF;

  v_desc := COALESCE(NULLIF(TRIM(NEW.description), ''), 'Trip payment');
  IF v_desc !~* 'Sync\s*:\s*FLEET_PAID_PENDING' THEN
    v_desc := v_desc || ' | Sync: FLEET_PAID_PENDING';
  END IF;

  INSERT INTO public.driver_ledger
    (organization_id, driver_id, trip_id, type, amount,
     description, reference_type, reference_id, created_by)
  VALUES
    (NEW.organization_id, NEW.contact_id, NEW.trip_id, 'adjustment', NEW.amount_out,
     v_desc, 'transaction', NEW.id, NEW.created_by);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_driver_ledger_from_transaction() IS
  'Derives the fleet-side driver_ledger row (adjustment + FLEET_PAID_PENDING) from a driver-payable transaction, so the driver app cannot disagree with recorded payment. Never writes type=settlement — that is the driver''s own receipt confirmation.';

DROP TRIGGER IF EXISTS trg_sync_driver_ledger_from_transaction ON public.transactions;

CREATE TRIGGER trg_sync_driver_ledger_from_transaction
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_driver_ledger_from_transaction();
