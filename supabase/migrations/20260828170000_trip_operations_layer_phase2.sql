-- Phase 2: Trip Operations Layer foundation (fuel + toll, lightweight).
-- Additive only; does not alter trip lifecycle/status logic.

-- Extend trip_documents typed categories for operations receipts.
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
        'toll_receipt_photo'::text
      ]
    )
  );

CREATE TABLE IF NOT EXISTS public.trip_fuel_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  amount_inr numeric(12,2) NOT NULL DEFAULT 0,
  liters numeric(12,3),
  fuel_type text,
  station_name text,
  notes text,
  bill_storage_path text,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'active',
  CONSTRAINT trip_fuel_entries_amount_non_negative CHECK (amount_inr >= 0),
  CONSTRAINT trip_fuel_entries_liters_non_negative CHECK (liters IS NULL OR liters >= 0),
  CONSTRAINT trip_fuel_entries_status_check CHECK (status = ANY (ARRAY['active'::text, 'voided'::text]))
);

CREATE INDEX IF NOT EXISTS idx_trip_fuel_entries_trip_id
  ON public.trip_fuel_entries(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_fuel_entries_trip_entered_at
  ON public.trip_fuel_entries(trip_id, entered_at DESC);

ALTER TABLE public.trip_fuel_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_fuel_entries TO authenticated;
GRANT ALL ON public.trip_fuel_entries TO service_role;

DROP POLICY IF EXISTS "trip_fuel_entries_visible_trip_members" ON public.trip_fuel_entries;
CREATE POLICY "trip_fuel_entries_visible_trip_members"
  ON public.trip_fuel_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_fuel_entries.trip_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_fuel_entries.trip_id
    )
  );

CREATE TABLE IF NOT EXISTS public.trip_toll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  amount_inr numeric(12,2) NOT NULL DEFAULT 0,
  plaza_name text,
  notes text,
  is_estimated boolean NOT NULL DEFAULT false,
  receipt_storage_path text,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'active',
  CONSTRAINT trip_toll_entries_amount_non_negative CHECK (amount_inr >= 0),
  CONSTRAINT trip_toll_entries_status_check CHECK (status = ANY (ARRAY['active'::text, 'voided'::text]))
);

CREATE INDEX IF NOT EXISTS idx_trip_toll_entries_trip_id
  ON public.trip_toll_entries(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_toll_entries_trip_entered_at
  ON public.trip_toll_entries(trip_id, entered_at DESC);

ALTER TABLE public.trip_toll_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_toll_entries TO authenticated;
GRANT ALL ON public.trip_toll_entries TO service_role;

DROP POLICY IF EXISTS "trip_toll_entries_visible_trip_members" ON public.trip_toll_entries;
CREATE POLICY "trip_toll_entries_visible_trip_members"
  ON public.trip_toll_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_toll_entries.trip_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_toll_entries.trip_id
    )
  );
