-- Fix: trips.amount_paid / trips.payment_status never update when a transactions
-- row is posted for a trip (client receipt or supplier/driver payout). Confirmed live
-- on TRP003 and reproduced on a fresh test trip: money moves in `transactions`, but
-- the trip's own amount_paid/payment_status stay stale ('pending', 0.00) forever.
--
-- Scope: minimal targeted patch. Recomputes amount_paid as the net of client
-- receipts (Dr Cash / Cr AR: amount_in - amount_out for contact_type='client')
-- and derives payment_status from amount_paid vs client_price. Does not touch
-- adjustments/margin/settlement — that is the larger TDD-scoped fix.

CREATE OR REPLACE FUNCTION public.sync_trip_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trip_id uuid;
  v_client_price numeric(12,2);
  v_amount_paid numeric(12,2);
  v_status text;
BEGIN
  v_trip_id := COALESCE(NEW.trip_id, OLD.trip_id);
  IF v_trip_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT client_price INTO v_client_price
  FROM public.trips
  WHERE id = v_trip_id;

  IF v_client_price IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount_in) - SUM(amount_out), 0)
  INTO v_amount_paid
  FROM public.transactions
  WHERE trip_id = v_trip_id
    AND contact_type = 'client';

  v_amount_paid := GREATEST(v_amount_paid, 0);

  v_status := CASE
    WHEN v_amount_paid <= 0 THEN 'pending'
    WHEN v_amount_paid >= v_client_price THEN 'paid'
    ELSE 'partial'
  END;

  UPDATE public.trips
  SET amount_paid = v_amount_paid,
      payment_status = v_status
  WHERE id = v_trip_id
    AND (amount_paid IS DISTINCT FROM v_amount_paid
         OR payment_status IS DISTINCT FROM v_status);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_trip_payment_status ON public.transactions;
CREATE TRIGGER trg_sync_trip_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_trip_payment_status();

-- One-time backfill: recompute for every trip that already has client transactions,
-- so existing broken trips (e.g. TRP003, TRP001) self-correct on migration apply.
DO $$
DECLARE
  r RECORD;
  v_amount_paid numeric(12,2);
  v_status text;
BEGIN
  FOR r IN
    SELECT DISTINCT t.trip_id, tr.client_price
    FROM public.transactions t
    JOIN public.trips tr ON tr.id = t.trip_id
    WHERE t.trip_id IS NOT NULL AND t.contact_type = 'client'
  LOOP
    SELECT GREATEST(COALESCE(SUM(amount_in) - SUM(amount_out), 0), 0)
    INTO v_amount_paid
    FROM public.transactions
    WHERE trip_id = r.trip_id AND contact_type = 'client';

    v_status := CASE
      WHEN v_amount_paid <= 0 THEN 'pending'
      WHEN v_amount_paid >= r.client_price THEN 'paid'
      ELSE 'partial'
    END;

    UPDATE public.trips
    SET amount_paid = v_amount_paid,
        payment_status = v_status
    WHERE id = r.trip_id
      AND (amount_paid IS DISTINCT FROM v_amount_paid
           OR payment_status IS DISTINCT FROM v_status);
  END LOOP;
END $$;
