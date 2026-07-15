-- Phase: Toll approval + posting parity (additive).

ALTER TABLE public.trip_toll_entries
  ADD COLUMN IF NOT EXISTS payment_owner text NOT NULL DEFAULT 'organization',
  ADD COLUMN IF NOT EXISTS payment_mode text,
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'reported',
  ADD COLUMN IF NOT EXISTS ledger_state text NOT NULL DEFAULT 'not_posted',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.trip_toll_entries
  DROP CONSTRAINT IF EXISTS trip_toll_entries_payment_owner_check;
ALTER TABLE public.trip_toll_entries
  ADD CONSTRAINT trip_toll_entries_payment_owner_check CHECK (
    payment_owner = ANY (
      ARRAY[
        'organization'::text,
        'driver'::text,
        'supplier'::text,
        'fleet_card'::text,
        'fastag'::text,
        'cash_advance'::text,
        'credit_vendor'::text
      ]
    )
  );

ALTER TABLE public.trip_toll_entries
  DROP CONSTRAINT IF EXISTS trip_toll_entries_approval_state_check_v2;
ALTER TABLE public.trip_toll_entries
  ADD CONSTRAINT trip_toll_entries_approval_state_check_v2 CHECK (
    approval_state = ANY (
      ARRAY[
        'reported'::text,
        'review_pending'::text,
        'approved'::text,
        'rejected'::text,
        'settled'::text
      ]
    )
  );

ALTER TABLE public.trip_toll_entries
  DROP CONSTRAINT IF EXISTS trip_toll_entries_ledger_state_check;
ALTER TABLE public.trip_toll_entries
  ADD CONSTRAINT trip_toll_entries_ledger_state_check CHECK (
    ledger_state = ANY (ARRAY['not_posted'::text, 'posted'::text, 'void'::text])
  );

CREATE INDEX IF NOT EXISTS idx_trip_toll_entries_approval_state
  ON public.trip_toll_entries(approval_state, entered_at DESC);
