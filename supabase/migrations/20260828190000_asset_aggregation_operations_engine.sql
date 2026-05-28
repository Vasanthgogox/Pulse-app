-- Phase 5: Asset vs aggregation operations engine + controlled posting.
-- Additive changes only.

ALTER TABLE public.trip_fuel_entries
  ADD COLUMN IF NOT EXISTS payment_owner text NOT NULL DEFAULT 'organization',
  ADD COLUMN IF NOT EXISTS payment_mode text,
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'reported',
  ADD COLUMN IF NOT EXISTS ledger_state text NOT NULL DEFAULT 'not_posted',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.trip_fuel_entries
  DROP CONSTRAINT IF EXISTS trip_fuel_entries_payment_owner_check;
ALTER TABLE public.trip_fuel_entries
  ADD CONSTRAINT trip_fuel_entries_payment_owner_check CHECK (
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

ALTER TABLE public.trip_fuel_entries
  DROP CONSTRAINT IF EXISTS trip_fuel_entries_approval_state_check;
ALTER TABLE public.trip_fuel_entries
  ADD CONSTRAINT trip_fuel_entries_approval_state_check CHECK (
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

ALTER TABLE public.trip_fuel_entries
  DROP CONSTRAINT IF EXISTS trip_fuel_entries_ledger_state_check;
ALTER TABLE public.trip_fuel_entries
  ADD CONSTRAINT trip_fuel_entries_ledger_state_check CHECK (
    ledger_state = ANY (ARRAY['not_posted'::text, 'posted'::text, 'void'::text])
  );

CREATE INDEX IF NOT EXISTS idx_trip_fuel_entries_approval_state
  ON public.trip_fuel_entries(approval_state, entered_at DESC);

CREATE TABLE IF NOT EXISTS public.vehicle_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  entry_type text NOT NULL,
  debit numeric(12,2),
  credit numeric(12,2),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_ledger_entries_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT vehicle_ledger_entries_debit_non_negative CHECK (debit IS NULL OR debit >= 0),
  CONSTRAINT vehicle_ledger_entries_credit_non_negative CHECK (credit IS NULL OR credit >= 0),
  CONSTRAINT vehicle_ledger_entries_source_type_check CHECK (
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
        'repair'::text
      ]
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_ledger_entries_source_unique
  ON public.vehicle_ledger_entries(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_ledger_entries_vehicle_posted
  ON public.vehicle_ledger_entries(organization_id, vehicle_id, posted_at DESC);

ALTER TABLE public.vehicle_ledger_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.vehicle_ledger_entries TO authenticated;
GRANT ALL ON public.vehicle_ledger_entries TO service_role;

DROP POLICY IF EXISTS "vehicle_ledger_entries_org_member_select" ON public.vehicle_ledger_entries;
CREATE POLICY "vehicle_ledger_entries_org_member_select"
  ON public.vehicle_ledger_entries
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "vehicle_ledger_entries_org_member_insert" ON public.vehicle_ledger_entries;
CREATE POLICY "vehicle_ledger_entries_org_member_insert"
  ON public.vehicle_ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "vehicle_ledger_entries_org_member_update" ON public.vehicle_ledger_entries;
CREATE POLICY "vehicle_ledger_entries_org_member_update"
  ON public.vehicle_ledger_entries
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
