-- Trip other expenses: parking, challan, loading, detention, etc. (not commercial adjustments).

ALTER TABLE public.trip_documents
  DROP CONSTRAINT IF EXISTS trip_documents_type_check;

ALTER TABLE public.trip_documents
  ADD CONSTRAINT trip_documents_type_check
  CHECK (
    document_type = ANY (
      ARRAY[
        'manifest'::text,
        'pod'::text,
        'invoice'::text,
        'eway_bill'::text,
        'loading_slip'::text,
        'odometer_start_photo'::text,
        'odometer_end_photo'::text,
        'fuel_bill_photo'::text,
        'toll_receipt_photo'::text,
        'trip_expense_receipt_photo'::text
      ]
    )
  );

CREATE TABLE IF NOT EXISTS public.trip_other_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  expense_category text NOT NULL,
  amount_inr numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  location_name text,
  notes text,
  receipt_storage_path text,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'active',
  payment_owner text NOT NULL DEFAULT 'organization',
  payment_mode text,
  approval_state text NOT NULL DEFAULT 'reported',
  ledger_state text NOT NULL DEFAULT 'not_posted',
  posting_state text NOT NULL DEFAULT 'pending',
  posting_error text,
  last_retry_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  reimbursement_state text NOT NULL DEFAULT 'reported',
  reimbursement_updated_at timestamptz,
  reimbursed_at timestamptz,
  reimbursed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reimbursement_notes text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  CONSTRAINT trip_other_expenses_amount_non_negative CHECK (amount_inr >= 0),
  CONSTRAINT trip_other_expenses_status_check CHECK (status = ANY (ARRAY['active'::text, 'voided'::text])),
  CONSTRAINT trip_other_expenses_category_check CHECK (
    expense_category = ANY (
      ARRAY[
        'parking'::text,
        'challan'::text,
        'loading'::text,
        'unloading'::text,
        'detention'::text,
        'maintenance'::text,
        'fastag'::text,
        'advance'::text,
        'food'::text,
        'weighbridge'::text,
        'misc'::text
      ]
    )
  ),
  CONSTRAINT trip_other_expenses_payment_owner_check CHECK (
    payment_owner = ANY (
      ARRAY[
        'organization'::text,
        'driver'::text,
        'supplier'::text,
        'fleet_card'::text,
        'fastag'::text,
        'cash_advance'::text,
        'credit_vendor'::text,
        'unknown'::text
      ]
    )
  ),
  CONSTRAINT trip_other_expenses_approval_state_check CHECK (
    approval_state = ANY (
      ARRAY[
        'reported'::text,
        'review_pending'::text,
        'approved'::text,
        'rejected'::text,
        'settled'::text
      ]
    )
  ),
  CONSTRAINT trip_other_expenses_ledger_state_check CHECK (
    ledger_state = ANY (ARRAY['not_posted'::text, 'posted'::text, 'void'::text])
  ),
  CONSTRAINT trip_other_expenses_posting_state_check CHECK (
    posting_state = ANY (
      ARRAY['pending'::text, 'approved'::text, 'posted'::text, 'rejected'::text, 'failed'::text]
    )
  ),
  CONSTRAINT trip_other_expenses_reimbursement_state_check CHECK (
    reimbursement_state = ANY (
      ARRAY[
        'reported'::text,
        'approved'::text,
        'reimbursement_pending'::text,
        'reimbursed'::text,
        'rejected'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_trip_other_expenses_trip_id
  ON public.trip_other_expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_other_expenses_trip_entered_at
  ON public.trip_other_expenses(trip_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_other_expenses_approval_state
  ON public.trip_other_expenses(approval_state, entered_at DESC);

ALTER TABLE public.trip_other_expenses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_other_expenses TO authenticated;
GRANT ALL ON public.trip_other_expenses TO service_role;

DROP POLICY IF EXISTS "trip_other_expenses_visible_trip_members" ON public.trip_other_expenses;
CREATE POLICY "trip_other_expenses_visible_trip_members"
  ON public.trip_other_expenses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_other_expenses.trip_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_other_expenses.trip_id
    )
  );
