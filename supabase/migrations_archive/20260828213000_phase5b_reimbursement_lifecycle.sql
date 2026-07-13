-- Phase 5B: reimbursement lifecycle (additive only)

ALTER TABLE public.trip_fuel_entries
  ADD COLUMN IF NOT EXISTS reimbursement_state text NOT NULL DEFAULT 'reported',
  ADD COLUMN IF NOT EXISTS reimbursement_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reimbursed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reimbursed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reimbursement_notes text;

ALTER TABLE public.trip_toll_entries
  ADD COLUMN IF NOT EXISTS reimbursement_state text NOT NULL DEFAULT 'reported',
  ADD COLUMN IF NOT EXISTS reimbursement_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reimbursed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reimbursed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reimbursement_notes text;

ALTER TABLE public.trip_fuel_entries
  DROP CONSTRAINT IF EXISTS trip_fuel_entries_reimbursement_state_check;
ALTER TABLE public.trip_fuel_entries
  ADD CONSTRAINT trip_fuel_entries_reimbursement_state_check CHECK (
    reimbursement_state = ANY (
      ARRAY[
        'reported'::text,
        'approved'::text,
        'reimbursement_pending'::text,
        'reimbursed'::text,
        'rejected'::text
      ]
    )
  );

ALTER TABLE public.trip_toll_entries
  DROP CONSTRAINT IF EXISTS trip_toll_entries_reimbursement_state_check;
ALTER TABLE public.trip_toll_entries
  ADD CONSTRAINT trip_toll_entries_reimbursement_state_check CHECK (
    reimbursement_state = ANY (
      ARRAY[
        'reported'::text,
        'approved'::text,
        'reimbursement_pending'::text,
        'reimbursed'::text,
        'rejected'::text
      ]
    )
  );

CREATE INDEX IF NOT EXISTS idx_trip_fuel_entries_reimbursement_state
  ON public.trip_fuel_entries (reimbursement_state, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_toll_entries_reimbursement_state
  ON public.trip_toll_entries (reimbursement_state, entered_at DESC);
