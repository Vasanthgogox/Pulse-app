-- Phase 5A: Operational accounting integrity hardening (additive only).

-- ---------------------------------------------------------------------------
-- PART 1: Organization operational numbering engine
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.operational_sequences (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  current_value bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, entity_type),
  CONSTRAINT operational_sequences_entity_type_check_v2 CHECK (
    entity_type = ANY (
      ARRAY[
        'trip'::text,
        'indent'::text,
        'vehicle'::text,
        'driver'::text,
        'invoice'::text,
        'pod'::text,
        'maintenance'::text
      ]
    )
  )
);

ALTER TABLE public.operational_sequences
  DROP CONSTRAINT IF EXISTS operational_sequences_entity_type_check;

ALTER TABLE public.operational_sequences
  DROP CONSTRAINT IF EXISTS operational_sequences_entity_type_check_v2;

ALTER TABLE public.operational_sequences
  ADD CONSTRAINT operational_sequences_entity_type_check_v2 CHECK (
    entity_type = ANY (
      ARRAY[
        'trip'::text,
        'indent'::text,
        'vehicle'::text,
        'driver'::text,
        'invoice'::text,
        'pod'::text,
        'maintenance'::text
      ]
    )
  );

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS trip_operational_code text,
  ADD COLUMN IF NOT EXISTS indent_reference_code text;

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS indent_operational_code text;

CREATE UNIQUE INDEX IF NOT EXISTS trips_trip_operational_code_unique
  ON public.trips (trip_operational_code)
  WHERE trip_operational_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS indents_indent_operational_code_unique
  ON public.indents (indent_operational_code)
  WHERE indent_operational_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trips_indent_reference_code
  ON public.trips (indent_reference_code);

CREATE INDEX IF NOT EXISTS idx_trips_trip_operational_code_pattern
  ON public.trips (trip_operational_code text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_indents_indent_operational_code_pattern
  ON public.indents (indent_operational_code text_pattern_ops);

CREATE OR REPLACE FUNCTION public.allocate_operational_sequence(
  p_org_id uuid,
  p_entity_type text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity text := lower(trim(p_entity_type));
  v_current bigint;
  v_next bigint;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required';
  END IF;

  INSERT INTO public.operational_sequences (organization_id, entity_type, current_value)
  VALUES (p_org_id, v_entity, 0)
  ON CONFLICT (organization_id, entity_type) DO NOTHING;

  SELECT current_value
  INTO v_current
  FROM public.operational_sequences
  WHERE organization_id = p_org_id
    AND entity_type = v_entity
  FOR UPDATE;

  v_next := coalesce(v_current, 0) + 1;

  UPDATE public.operational_sequences
  SET current_value = v_next,
      updated_at = now()
  WHERE organization_id = p_org_id
    AND entity_type = v_entity;

  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_enterprise_operational_code(
  p_org_id uuid,
  p_entity_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_code text;
  v_org_name text;
  v_org_short text;
  v_entity text := lower(trim(p_entity_type));
  v_prefix text;
  v_seq bigint;
BEGIN
  SELECT upper(btrim(coalesce(operational_code, ''))), coalesce(name, '')
  INTO v_org_code, v_org_name
  FROM public.organizations
  WHERE id = p_org_id;

  IF v_org_code IS NULL OR btrim(v_org_code) = '' THEN
    RAISE EXCEPTION 'operational_code missing for organization %', p_org_id;
  END IF;

  v_org_short := upper(substr(regexp_replace(v_org_name, '[^A-Za-z]', '', 'g') || 'ORG', 1, 3));

  CASE v_entity
    WHEN 'trip' THEN v_prefix := 'TRIP';
    WHEN 'indent' THEN v_prefix := 'IND';
    WHEN 'vehicle' THEN v_prefix := 'VEH';
    WHEN 'driver' THEN v_prefix := 'DRV';
    WHEN 'invoice' THEN v_prefix := 'INV';
    WHEN 'pod' THEN v_prefix := 'POD';
    WHEN 'maintenance' THEN v_prefix := 'MNT';
    ELSE
      RAISE EXCEPTION 'Unsupported entity_type: %', p_entity_type;
  END CASE;

  v_seq := public.allocate_operational_sequence(p_org_id, v_entity);
  RETURN v_org_code || v_org_short || v_prefix || lpad(v_seq::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_trip_operational_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.trip_operational_code IS NULL OR btrim(NEW.trip_operational_code) = '' THEN
    NEW.trip_operational_code := public.generate_enterprise_operational_code(
      NEW.organization_id,
      'trip'
    );
  END IF;

  IF NEW.indent_id IS NOT NULL AND (NEW.indent_reference_code IS NULL OR btrim(NEW.indent_reference_code) = '') THEN
    SELECT coalesce(i.indent_operational_code, i.indent_code, i.display_indent_id, i.indent_number)
    INTO NEW.indent_reference_code
    FROM public.indents i
    WHERE i.id = NEW.indent_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_indent_operational_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.indent_operational_code IS NULL OR btrim(NEW.indent_operational_code) = '' THEN
    NEW.indent_operational_code := public.generate_enterprise_operational_code(
      NEW.organization_id,
      'indent'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_trip_operational_code ON public.trips;
CREATE TRIGGER trg_set_trip_operational_code
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_trip_operational_code();

DROP TRIGGER IF EXISTS trg_set_indent_operational_code ON public.indents;
CREATE TRIGGER trg_set_indent_operational_code
  BEFORE INSERT ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_indent_operational_code();

WITH trip_rows AS (
  SELECT
    t.id,
    t.organization_id,
    row_number() OVER (PARTITION BY t.organization_id ORDER BY t.created_at NULLS LAST, t.id)::bigint AS seq
  FROM public.trips t
),
indent_rows AS (
  SELECT
    i.id,
    i.organization_id,
    row_number() OVER (PARTITION BY i.organization_id ORDER BY i.created_at NULLS LAST, i.id)::bigint AS seq
  FROM public.indents i
)
INSERT INTO public.operational_sequences (organization_id, entity_type, current_value)
SELECT organization_id, 'trip', max(seq) FROM trip_rows GROUP BY organization_id
ON CONFLICT (organization_id, entity_type) DO UPDATE
SET current_value = greatest(public.operational_sequences.current_value, EXCLUDED.current_value),
    updated_at = now();

WITH trip_rows AS (
  SELECT
    t.id,
    t.organization_id,
    row_number() OVER (PARTITION BY t.organization_id ORDER BY t.created_at NULLS LAST, t.id)::bigint AS seq
  FROM public.trips t
),
indent_rows AS (
  SELECT
    i.id,
    i.organization_id,
    row_number() OVER (PARTITION BY i.organization_id ORDER BY i.created_at NULLS LAST, i.id)::bigint AS seq
  FROM public.indents i
)
INSERT INTO public.operational_sequences (organization_id, entity_type, current_value)
SELECT organization_id, 'indent', max(seq) FROM indent_rows GROUP BY organization_id
ON CONFLICT (organization_id, entity_type) DO UPDATE
SET current_value = greatest(public.operational_sequences.current_value, EXCLUDED.current_value),
    updated_at = now();

WITH trip_rows AS (
  SELECT
    t.id,
    t.organization_id,
    t.indent_id,
    row_number() OVER (PARTITION BY t.organization_id ORDER BY t.created_at NULLS LAST, t.id)::bigint AS seq
  FROM public.trips t
)
UPDATE public.trips t
SET
  trip_operational_code = coalesce(
    t.trip_operational_code,
    upper(coalesce(o.operational_code, 'ORG')) ||
      upper(substr(regexp_replace(coalesce(o.name, ''), '[^A-Za-z]', '', 'g') || 'ORG', 1, 3)) ||
      'TRIP' || lpad(tr.seq::text, 6, '0')
  ),
  indent_reference_code = coalesce(
    nullif(btrim(t.indent_reference_code), ''),
    i.indent_operational_code,
    i.indent_code,
    i.display_indent_id,
    i.indent_number
  )
FROM trip_rows tr
JOIN public.organizations o ON o.id = tr.organization_id
LEFT JOIN public.indents i ON i.id = tr.indent_id
WHERE t.id = tr.id;

WITH indent_rows AS (
  SELECT
    i.id,
    i.organization_id,
    row_number() OVER (PARTITION BY i.organization_id ORDER BY i.created_at NULLS LAST, i.id)::bigint AS seq
  FROM public.indents i
)
UPDATE public.indents i
SET indent_operational_code = coalesce(
  i.indent_operational_code,
  upper(coalesce(o.operational_code, 'ORG')) ||
    upper(substr(regexp_replace(coalesce(o.name, ''), '[^A-Za-z]', '', 'g') || 'ORG', 1, 3)) ||
    'IND' || lpad(ir.seq::text, 6, '0')
)
FROM indent_rows ir
JOIN public.organizations o ON o.id = ir.organization_id
WHERE i.id = ir.id;

-- ---------------------------------------------------------------------------
-- PART 3 + PART 4: Responsibility model + posting runtime safety
-- ---------------------------------------------------------------------------

ALTER TABLE public.trip_fuel_entries
  ADD COLUMN IF NOT EXISTS posting_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS posting_error text,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.trip_toll_entries
  ADD COLUMN IF NOT EXISTS posting_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS posting_error text,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

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
        'credit_vendor'::text,
        'unknown'::text
      ]
    )
  );

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
        'credit_vendor'::text,
        'unknown'::text
      ]
    )
  );

ALTER TABLE public.trip_fuel_entries
  DROP CONSTRAINT IF EXISTS trip_fuel_entries_posting_state_check;
ALTER TABLE public.trip_fuel_entries
  ADD CONSTRAINT trip_fuel_entries_posting_state_check CHECK (
    posting_state = ANY (
      ARRAY['pending'::text, 'approved'::text, 'posted'::text, 'rejected'::text, 'failed'::text]
    )
  );

ALTER TABLE public.trip_toll_entries
  DROP CONSTRAINT IF EXISTS trip_toll_entries_posting_state_check;
ALTER TABLE public.trip_toll_entries
  ADD CONSTRAINT trip_toll_entries_posting_state_check CHECK (
    posting_state = ANY (
      ARRAY['pending'::text, 'approved'::text, 'posted'::text, 'rejected'::text, 'failed'::text]
    )
  );

CREATE INDEX IF NOT EXISTS idx_trip_fuel_entries_posting_state
  ON public.trip_fuel_entries (posting_state, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_toll_entries_posting_state
  ON public.trip_toll_entries (posting_state, entered_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_ledger_source_idempotency
  ON public.vehicle_ledger_entries (source_type, source_id);

-- ---------------------------------------------------------------------------
-- PART 5: Operational audit timeline (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_operational_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  source_type text,
  source_id uuid,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_operational_timeline_trip_created
  ON public.trip_operational_timeline_events (trip_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_operational_timeline_org_created
  ON public.trip_operational_timeline_events (organization_id, created_at DESC);

ALTER TABLE public.trip_operational_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip operational timeline select" ON public.trip_operational_timeline_events;
CREATE POLICY "trip operational timeline select"
ON public.trip_operational_timeline_events
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "trip operational timeline insert" ON public.trip_operational_timeline_events;
CREATE POLICY "trip operational timeline insert"
ON public.trip_operational_timeline_events
FOR INSERT
TO authenticated
WITH CHECK (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- PART 6: Vehicle maintenance foundation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  maintenance_type text NOT NULL,
  amount_inr numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  invoice_storage_path text,
  next_due_km numeric(12,2),
  next_due_date date,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  CONSTRAINT vehicle_maintenance_entries_amount_non_negative CHECK (amount_inr >= 0),
  CONSTRAINT vehicle_maintenance_entries_type_check CHECK (
    maintenance_type = ANY (
      ARRAY[
        'service'::text,
        'repair'::text,
        'puncture'::text,
        'tyre'::text,
        'oil_change'::text,
        'permit'::text,
        'insurance'::text,
        'fitness'::text
      ]
    )
  ),
  CONSTRAINT vehicle_maintenance_entries_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'void'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_org_vehicle_entered
  ON public.vehicle_maintenance_entries (organization_id, vehicle_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_trip_entered
  ON public.vehicle_maintenance_entries (trip_id, entered_at DESC);

ALTER TABLE public.vehicle_maintenance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle maintenance select" ON public.vehicle_maintenance_entries;
CREATE POLICY "vehicle maintenance select"
ON public.vehicle_maintenance_entries
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "vehicle maintenance insert" ON public.vehicle_maintenance_entries;
CREATE POLICY "vehicle maintenance insert"
ON public.vehicle_maintenance_entries
FOR INSERT
TO authenticated
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "vehicle maintenance update" ON public.vehicle_maintenance_entries;
CREATE POLICY "vehicle maintenance update"
ON public.vehicle_maintenance_entries
FOR UPDATE
TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));
