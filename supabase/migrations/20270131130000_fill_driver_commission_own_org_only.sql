-- A driver is paid by their employer, never by their employer's customer.
--
-- The bug
-- -------
-- fill_driver_commission stamped a commission onto ANY trip that completed while
-- carrying a driver_id, without checking whether that driver works for the trip's
-- organization.
--
-- On an awarded load there are two trip rows (docs/TRIP_VARIANTS.md §4) and the
-- mover's driver is stamped on BOTH: the mover's own work row, and the middleman's
-- row -- on the latter purely so the broker can track who is carrying its client's
-- goods. Completing the pair therefore paid the driver twice, and the phantom half
-- was computed off the BROKER's client_price, which is the larger number.
--
-- Verified live (alishek, PR logistics driver, on ITS Logistics' awarded load):
--   own row   TRP007 (PR logistics)  5% of 38,000 = 1,900   <- correct
--   broker    TRP017 (ITS Logistics) 5% of 55,000 = 2,750   <- phantom
--   driver wallet "to collect"                     = 4,650  <- wrong
--
-- Platform-wide this had produced 8 phantom commissions across 6 drivers
-- (52,403 total). No payout had been made against any of them -- driver_ledger
-- had zero rows for every affected trip -- so nothing was actually mispaid.
--
-- The fix
-- -------
-- Only auto-fill when drivers.organization_id = trips.organization_id.
--
-- Scoped to the AUTO-FILL only: the function already returns early when
-- driver_commission is non-zero, so a figure entered by hand still survives. This
-- adds no new failure mode -- a skipped fill leaves the column at its default 0,
-- exactly as it already did for trips with no commission terms configured.
--
-- Existing rows were corrected separately: 7 of the 8 were zeroed (each had its
-- own mover_asset row carrying the real payout, and no driver_ledger entry). The
-- 8th was deliberately left alone -- driver Mani's broker row on MAX's TRP007 has
-- NO paired mover_asset row, so zeroing it would have erased their only earnings
-- record. That one needs a product decision, not a data patch.

CREATE OR REPLACE FUNCTION public.fill_driver_commission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_commission_percent NUMERIC;
  v_commission_per_km  NUMERIC;
  v_driver_org         uuid;
BEGIN
  IF NEW.driver_id IS NULL OR COALESCE(NEW.driver_commission, 0) != 0 THEN
    RETURN NEW;
  END IF;

  SELECT commission_percent, commission_per_km, organization_id
  INTO v_commission_percent, v_commission_per_km, v_driver_org
  FROM drivers
  WHERE id = NEW.driver_id
  LIMIT 1;

  -- Only the driver's own employer auto-pays them. On a middleman's row the
  -- driver belongs to the supplier, so leave commission at 0 -- the mover's own
  -- mover_asset row carries the real payout.
  IF v_driver_org IS DISTINCT FROM NEW.organization_id THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_commission_percent, 0) > 0 AND COALESCE(NEW.client_price, 0) > 0 THEN
    NEW.driver_commission := ROUND(NEW.client_price * v_commission_percent / 100, 2);
  ELSIF COALESCE(v_commission_per_km, 0) > 0 AND COALESCE(NEW.distance, 0) > 0 THEN
    NEW.driver_commission := ROUND(CAST(NEW.distance AS NUMERIC) * v_commission_per_km, 2);
  END IF;

  RETURN NEW;
END;
$$;
