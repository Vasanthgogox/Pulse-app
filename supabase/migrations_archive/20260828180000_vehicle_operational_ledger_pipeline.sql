-- Phase 4: Vehicle Operational Ledger pipeline (operational economics only).
-- Additive table; source records remain in trip_fuel_entries / trip_toll_entries.

CREATE TABLE IF NOT EXISTS public.vehicle_operation_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  entry_type text NOT NULL DEFAULT 'expense',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  approval_state text NOT NULL DEFAULT 'draft',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_operation_ledger_entries_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT vehicle_operation_ledger_entries_source_type_check CHECK (
    source_type = ANY (
      ARRAY[
        'fuel'::text,
        'toll'::text,
        'maintenance'::text,
        'repair'::text,
        'service'::text,
        'insurance'::text,
        'permit'::text,
        'manual_adjustment'::text
      ]
    )
  ),
  CONSTRAINT vehicle_operation_ledger_entries_entry_type_check CHECK (
    entry_type = ANY (ARRAY['expense'::text, 'adjustment'::text])
  ),
  CONSTRAINT vehicle_operation_ledger_entries_approval_state_check CHECK (
    approval_state = ANY (
      ARRAY['draft'::text, 'verified'::text, 'approved'::text, 'ignored'::text]
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_ops_ledger_source_unique
  ON public.vehicle_operation_ledger_entries(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_ops_ledger_vehicle_state_created
  ON public.vehicle_operation_ledger_entries(organization_id, vehicle_id, approval_state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_ops_ledger_trip_id
  ON public.vehicle_operation_ledger_entries(trip_id);

ALTER TABLE public.vehicle_operation_ledger_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.vehicle_operation_ledger_entries TO authenticated;
GRANT ALL ON public.vehicle_operation_ledger_entries TO service_role;

DROP POLICY IF EXISTS "vehicle_ops_ledger_org_member_select" ON public.vehicle_operation_ledger_entries;
CREATE POLICY "vehicle_ops_ledger_org_member_select"
  ON public.vehicle_operation_ledger_entries
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "vehicle_ops_ledger_org_member_insert" ON public.vehicle_operation_ledger_entries;
CREATE POLICY "vehicle_ops_ledger_org_member_insert"
  ON public.vehicle_operation_ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "vehicle_ops_ledger_org_member_update" ON public.vehicle_operation_ledger_entries;
CREATE POLICY "vehicle_ops_ledger_org_member_update"
  ON public.vehicle_operation_ledger_entries
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
