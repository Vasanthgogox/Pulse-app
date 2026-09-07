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
  'Unit of supplier_target: per_mt (rate x tonnes = trip total) or per_trip (already a total). NULL means legacy/untagged and is read as per_trip.';

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
