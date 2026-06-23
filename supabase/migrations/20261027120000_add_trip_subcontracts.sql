-- Phase C: trip_subcontracts (contract doc + off-platform + payment_ref on transactions).
-- Source: docs/TRIP_SUBCONTRACTS_BACKEND_CONTRACT.sql

-- ── C1.1 trip_subcontracts table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trip_subcontracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  supplier_id uuid NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  rate numeric NOT NULL DEFAULT 0,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Phase C extensions
  sub_supplier_on_platform boolean NOT NULL DEFAULT false,
  sub_supplier_name text,
  sub_supplier_phone text,
  sub_trip_code text,
  sub_supplier_org_id uuid NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  sub_driver_id uuid NULL REFERENCES public.drivers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  CONSTRAINT trip_subcontracts_viewer_trip_unique UNIQUE (viewer_org_id, trip_id),
  CONSTRAINT chk_sub_supplier_identity CHECK (
    (sub_supplier_on_platform = true AND sub_supplier_org_id IS NOT NULL)
    OR
    (sub_supplier_on_platform = false AND sub_supplier_name IS NOT NULL)
  ),
  CONSTRAINT chk_trip_subcontracts_status CHECK (
    status IN ('pending', 'active', 'completed', 'cancelled')
  )
);

COMMENT ON TABLE public.trip_subcontracts IS
  'Carrier-org downstream subcontract for a trip they can see (load-based / supplier view). Not visible to shipper.';

COMMENT ON COLUMN public.trip_subcontracts.viewer_org_id IS
  'Sourcing carrier org (Thameem) that created this subcontract row.';
COMMENT ON COLUMN public.trip_subcontracts.trip_id IS
  'Parent trip owned by shipper org.';
COMMENT ON COLUMN public.trip_subcontracts.sub_supplier_org_id IS
  'Linked organization of on-platform downstream supplier.';
COMMENT ON COLUMN public.trip_subcontracts.sub_trip_code IS
  'Auto-generated {operational_code}-SUB-{sqids} when NULL on INSERT.';

-- ── C1.4 indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trip_subcontracts_trip
  ON public.trip_subcontracts (trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_subcontracts_viewer_org
  ON public.trip_subcontracts (viewer_org_id);

CREATE INDEX IF NOT EXISTS idx_trip_subcontracts_sub_supplier_org
  ON public.trip_subcontracts (sub_supplier_org_id)
  WHERE sub_supplier_on_platform = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_subcontracts_sub_trip_code_unique
  ON public.trip_subcontracts (sub_trip_code)
  WHERE sub_trip_code IS NOT NULL;

-- ── updated_at ───────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trip_subcontracts_updated_at ON public.trip_subcontracts;
CREATE TRIGGER trip_subcontracts_updated_at
  BEFORE UPDATE ON public.trip_subcontracts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── C1.3 sub_trip_code generation ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subcontract_counters (
  sourcing_org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0
);

ALTER TABLE public.subcontract_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.increment_subcontract_seq(p_sourcing_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  IF p_sourcing_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.subcontract_counters (sourcing_org_id, seq)
  VALUES (p_sourcing_org_id, 1)
  ON CONFLICT (sourcing_org_id) DO UPDATE
    SET seq = public.subcontract_counters.seq + 1
  RETURNING seq INTO v_seq;

  RETURN v_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_subcontract_seq(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_subcontract_seq(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_subcontract_seq(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.sqids_encode_sub_trip_code(
  p_operational_code text,
  p_seq bigint
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(p_operational_code)) || '-SUB-' || public.sqids_encode_id(p_seq);
$$;

CREATE OR REPLACE FUNCTION public.trg_set_sub_trip_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
  v_operational_code text;
BEGIN
  IF NEW.sub_trip_code IS NOT NULL AND btrim(NEW.sub_trip_code) <> '' THEN
    RETURN NEW;
  END IF;

  v_seq := public.increment_subcontract_seq(NEW.viewer_org_id);
  IF v_seq IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.operational_code
  INTO v_operational_code
  FROM public.organizations o
  WHERE o.id = NEW.viewer_org_id;

  IF v_operational_code IS NULL OR btrim(v_operational_code) = '' THEN
    PERFORM public.ensure_organization_operational_code(NEW.viewer_org_id);
    SELECT o.operational_code
    INTO v_operational_code
    FROM public.organizations o
    WHERE o.id = NEW.viewer_org_id;
  END IF;

  IF v_operational_code IS NULL OR btrim(v_operational_code) = '' THEN
    RAISE EXCEPTION 'Cannot generate sub_trip_code: sourcing org has no operational_code';
  END IF;

  NEW.sub_trip_code := public.sqids_encode_sub_trip_code(v_operational_code, v_seq);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sub_trip_code ON public.trip_subcontracts;
CREATE TRIGGER trg_set_sub_trip_code
  BEFORE INSERT ON public.trip_subcontracts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_sub_trip_code();

-- ── C1.2 RLS (sourcing org / viewer_org only; no shipper read) ───────────────

ALTER TABLE public.trip_subcontracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read their trip subcontracts" ON public.trip_subcontracts;
CREATE POLICY "Org members can read their trip subcontracts"
  ON public.trip_subcontracts
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(viewer_org_id));

DROP POLICY IF EXISTS "Org members can insert their trip subcontracts" ON public.trip_subcontracts;
CREATE POLICY "Org members can insert their trip subcontracts"
  ON public.trip_subcontracts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(viewer_org_id));

DROP POLICY IF EXISTS "Org members can update their trip subcontracts" ON public.trip_subcontracts;
CREATE POLICY "Org members can update their trip subcontracts"
  ON public.trip_subcontracts
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(viewer_org_id))
  WITH CHECK (public.is_org_member(viewer_org_id));

DROP POLICY IF EXISTS "Org members can delete pending trip subcontracts" ON public.trip_subcontracts;
CREATE POLICY "Org members can delete pending trip subcontracts"
  ON public.trip_subcontracts
  FOR DELETE
  TO authenticated
  USING (
    public.is_org_member(viewer_org_id)
    AND status = 'pending'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_subcontracts TO authenticated;

-- ── Contract RPCs (on-platform supplier_id path) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_trip_subcontract(
  p_viewer_org_id uuid,
  p_trip_id uuid,
  p_supplier_id uuid,
  p_rate numeric
)
RETURNS public.trip_subcontracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.trip_subcontracts%rowtype;
  v_supplier_org uuid;
  v_linked_org uuid;
BEGIN
  IF p_viewer_org_id IS NULL OR p_trip_id IS NULL OR p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'viewer_org_id, trip_id, supplier_id are required';
  END IF;
  IF NOT public.is_org_member(p_viewer_org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF coalesce(p_rate, 0) < 0 THEN
    RAISE EXCEPTION 'Rate must be >= 0';
  END IF;

  SELECT s.organization_id, s.linked_organization_id
  INTO v_supplier_org, v_linked_org
  FROM public.suppliers s
  WHERE s.id = p_supplier_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;
  IF v_supplier_org <> p_viewer_org_id THEN
    RAISE EXCEPTION 'Supplier must belong to viewer org';
  END IF;

  INSERT INTO public.trip_subcontracts (
    viewer_org_id,
    trip_id,
    supplier_id,
    rate,
    created_by,
    sub_supplier_on_platform,
    sub_supplier_org_id,
    status
  ) VALUES (
    p_viewer_org_id,
    p_trip_id,
    p_supplier_id,
    coalesce(p_rate, 0),
    auth.uid(),
    true,
    v_linked_org,
    'pending'
  )
  ON CONFLICT (viewer_org_id, trip_id) DO UPDATE SET
    supplier_id = excluded.supplier_id,
    rate = excluded.rate,
    sub_supplier_on_platform = true,
    sub_supplier_org_id = excluded.sub_supplier_org_id,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_trip_subcontract(uuid, uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_trip_subcontract(uuid, uuid, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_subcontracts(
  p_viewer_org_id uuid,
  p_trip_ids uuid[]
)
RETURNS SETOF public.trip_subcontracts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ts.*
  FROM public.trip_subcontracts ts
  WHERE ts.viewer_org_id = p_viewer_org_id
    AND public.is_org_member(p_viewer_org_id)
    AND (p_trip_ids IS NULL OR cardinality(p_trip_ids) = 0 OR ts.trip_id = ANY(p_trip_ids));
$$;

REVOKE ALL ON FUNCTION public.get_trip_subcontracts(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trip_subcontracts(uuid, uuid[]) TO authenticated;

-- ── C4 payment_ref on transactions ─────────────────────────────────────────

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS booking_ref text;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_ref text;

-- FK requires a full UNIQUE constraint (partial index from Phase A is not enough).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trips_booking_ref_key'
  ) THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_booking_ref_key UNIQUE (booking_ref);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_booking_ref_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_booking_ref_fkey
      FOREIGN KEY (booking_ref)
      REFERENCES public.trips (booking_ref)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_booking_ref
  ON public.transactions (booking_ref)
  WHERE booking_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_set_transaction_payment_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.booking_ref IS NULL OR btrim(NEW.booking_ref) = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.payment_ref IS NOT NULL AND btrim(NEW.payment_ref) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.transactions t
  WHERE t.booking_ref = NEW.booking_ref;

  NEW.payment_ref := 'PAY-' || NEW.booking_ref || '-' || lpad(v_count::text, 2, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_transaction_payment_ref ON public.transactions;
CREATE TRIGGER trg_set_transaction_payment_ref
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_transaction_payment_ref();
