-- Supplier-side rate basis for indents.supplier_target.
--
-- Why a NEW column instead of reusing sale_rate_basis:
-- sale_rate_basis / sale_unit_rate describe the CLIENT SALE. The
-- trip_apply_sale_rate trigger (20270308103000) recomputes
--   client_price := sale_unit_rate * load_tons
-- whenever sale_rate_basis = 'per_mt'. Pointing that pair at a supplier buy
-- rate would make the trigger overwrite the client sell price with the
-- supplier rate. The two rates are independent: a load can be sold per-trip
-- and bought per-MT, or the reverse.
--
-- supplier_target itself stays as-entered (the unit rate for per_mt), matching
-- how sale_unit_rate holds the client unit rate. Read paths multiply by weight
-- via resolveCommercialPricing.

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS supplier_rate_basis text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'indents_supplier_rate_basis_check'
  ) THEN
    ALTER TABLE public.indents
      ADD CONSTRAINT indents_supplier_rate_basis_check
      CHECK (
        supplier_rate_basis IS NULL
        OR supplier_rate_basis IN ('per_mt', 'per_trip')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.indents.supplier_rate_basis IS
  'Unit of supplier_target: per_mt (rate x tonnes = trip total) or per_trip '
  '(already a total). NULL means legacy/untagged and is read as per_trip.';

-- Mirror onto trips so an awarded trip keeps the basis it was bought on.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS supplier_rate_basis text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trips_supplier_rate_basis_check'
  ) THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_supplier_rate_basis_check
      CHECK (
        supplier_rate_basis IS NULL
        OR supplier_rate_basis IN ('per_mt', 'per_trip')
      );
  END IF;
END $$;
