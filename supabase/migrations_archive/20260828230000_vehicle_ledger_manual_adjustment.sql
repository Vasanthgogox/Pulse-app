-- Allow trip other expenses (manual_adjustment) in vehicle_ledger_entries for approve-and-post flow.

ALTER TABLE public.vehicle_ledger_entries
  DROP CONSTRAINT IF EXISTS vehicle_ledger_entries_source_type_check;

ALTER TABLE public.vehicle_ledger_entries
  ADD CONSTRAINT vehicle_ledger_entries_source_type_check
  CHECK (
    source_type = ANY (
      ARRAY[
        'fuel'::text,
        'toll'::text,
        'maintenance'::text,
        'service'::text,
        'tire'::text,
        'battery'::text,
        'permit'::text,
        'insurance'::text,
        'repair'::text,
        'manual_adjustment'::text
      ]
    )
  );
