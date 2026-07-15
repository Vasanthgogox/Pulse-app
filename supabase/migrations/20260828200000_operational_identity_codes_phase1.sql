-- Phase 1: Deterministic operational identity system
-- Trip/Indent identity redesign with org-scoped code generation and lineage.

-- 1) Organization operational code (immutable in practice; set once + trigger guard).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS operational_code text;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_operational_code_unique
  ON public.organizations (operational_code)
  WHERE operational_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.make_operational_org_code(
  p_org_name text,
  p_org_id uuid,
  p_salt integer DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_letters text;
  v_hash_input text;
  v_hash_num bigint;
  v_digits text;
BEGIN
  v_letters := upper(regexp_replace(coalesce(p_org_name, 'ORG'), '[^A-Za-z]', '', 'g'));
  IF length(v_letters) = 0 THEN
    v_letters := 'ORG';
  END IF;
  v_letters := substr(v_letters || 'XXX', 1, 3);

  v_hash_input := coalesce(p_org_id::text, '') || ':' || coalesce(p_salt::text, '0');
  v_hash_num := (
    ('x' || substr(md5(v_hash_input), 1, 8))::bit(32)::bigint
  );
  v_digits := lpad(((abs(v_hash_num) % 1000))::text, 3, '0');

  RETURN v_letters || v_digits;
END;
$$;

DO $$
DECLARE
  r record;
  v_candidate text;
  v_salt integer;
BEGIN
  FOR r IN
    SELECT id, name
    FROM public.organizations
    WHERE operational_code IS NULL OR btrim(operational_code) = ''
  LOOP
    v_salt := 0;
    LOOP
      v_candidate := public.make_operational_org_code(r.name, r.id, v_salt);
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.organizations o
        WHERE o.operational_code = v_candidate
          AND o.id <> r.id
      );
      v_salt := v_salt + 1;
      IF v_salt > 100 THEN
        RAISE EXCEPTION 'Unable to allocate unique operational_code for org %', r.id;
      END IF;
    END LOOP;

    UPDATE public.organizations
    SET operational_code = v_candidate
    WHERE id = r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_operational_code_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.operational_code IS NOT NULL
     AND NEW.operational_code IS DISTINCT FROM OLD.operational_code THEN
    RAISE EXCEPTION 'organizations.operational_code is immutable once set';
  END IF;
  NEW.operational_code := upper(btrim(NEW.operational_code));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_operational_code_update ON public.organizations;
CREATE TRIGGER trg_prevent_operational_code_update
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_operational_code_update();

-- 2) Centralized organization sequence table.
CREATE TABLE IF NOT EXISTS public.operational_sequences (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  current_value bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, entity_type),
  CONSTRAINT operational_sequences_entity_type_check CHECK (
    entity_type = ANY (
      ARRAY['trip'::text, 'indent'::text, 'vehicle'::text, 'driver'::text, 'invoice'::text, 'pod'::text]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_operational_sequences_org_entity
  ON public.operational_sequences (organization_id, entity_type);

-- 3) New operational identity columns + lineage fields.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS trip_code text,
  ADD COLUMN IF NOT EXISTS sequence_number integer,
  ADD COLUMN IF NOT EXISTS display_trip_id text,
  ADD COLUMN IF NOT EXISTS source_indent_id uuid REFERENCES public.indents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_indent_code text,
  ADD COLUMN IF NOT EXISTS converted_from_indent_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS indent_code text,
  ADD COLUMN IF NOT EXISTS sequence_number integer,
  ADD COLUMN IF NOT EXISTS display_indent_id text;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_code text;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS driver_code text;

CREATE UNIQUE INDEX IF NOT EXISTS trips_trip_code_unique
  ON public.trips (trip_code)
  WHERE trip_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS indents_indent_code_unique
  ON public.indents (indent_code)
  WHERE indent_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vehicle_code_unique
  ON public.vehicles (vehicle_code)
  WHERE vehicle_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_driver_code_unique
  ON public.drivers (driver_code)
  WHERE driver_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trips_source_indent_id
  ON public.trips (source_indent_id);

CREATE INDEX IF NOT EXISTS idx_trips_source_indent_code
  ON public.trips (source_indent_code);

CREATE INDEX IF NOT EXISTS idx_trips_trip_code_pattern
  ON public.trips (trip_code text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_indents_indent_code_pattern
  ON public.indents (indent_code text_pattern_ops);

-- 4) Core generation helpers (transaction-safe, server-side only).
CREATE OR REPLACE FUNCTION public.operational_prefix_for_entity(p_entity_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE lower(trim(p_entity_type))
    WHEN 'trip' THEN RETURN 'TRP';
    WHEN 'indent' THEN RETURN 'IND';
    WHEN 'vehicle' THEN RETURN 'VEH';
    WHEN 'driver' THEN RETURN 'DRV';
    WHEN 'invoice' THEN RETURN 'INV';
    WHEN 'pod' THEN RETURN 'POD';
    ELSE
      RAISE EXCEPTION 'Unsupported entity_type: %', p_entity_type;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_operational_sequence_value(
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
    RAISE EXCEPTION 'Organization id is required';
  END IF;

  IF v_entity NOT IN ('trip', 'indent', 'vehicle', 'driver', 'invoice', 'pod') THEN
    RAISE EXCEPTION 'Unsupported entity_type: %', p_entity_type;
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

CREATE OR REPLACE FUNCTION public.generate_operational_code(
  org_id uuid,
  entity_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_code text;
  v_entity text := lower(trim(entity_type));
  v_seq bigint;
  v_prefix text;
BEGIN
  SELECT operational_code
  INTO v_org_code
  FROM public.organizations
  WHERE id = org_id;

  IF v_org_code IS NULL OR btrim(v_org_code) = '' THEN
    RAISE EXCEPTION 'Organization operational_code missing for org %', org_id;
  END IF;

  v_prefix := public.operational_prefix_for_entity(v_entity);
  v_seq := public.next_operational_sequence_value(org_id, v_entity);

  RETURN upper(v_org_code) || '-' || v_prefix || '-' || lpad(v_seq::text, 3, '0');
END;
$$;

-- 5) Triggers: write operational code + preserve legacy display fields.
CREATE OR REPLACE FUNCTION public.set_trip_operational_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_text text;
  v_seq_int integer;
  v_legacy text;
BEGIN
  IF NEW.trip_code IS NULL OR btrim(NEW.trip_code) = '' THEN
    NEW.trip_code := public.generate_operational_code(NEW.organization_id, 'trip');
  END IF;

  v_seq_text := substring(NEW.trip_code FROM '([0-9]+)$');
  v_seq_int := CASE WHEN v_seq_text IS NULL THEN NULL ELSE v_seq_text::integer END;
  v_legacy := 'TRP' || lpad(coalesce(v_seq_int, 1)::text, 3, '0');

  IF NEW.trip_number IS NULL OR btrim(NEW.trip_number) = '' THEN
    NEW.trip_number := v_legacy;
  END IF;
  IF NEW.display_trip_id IS NULL OR btrim(NEW.display_trip_id) = '' THEN
    NEW.display_trip_id := v_legacy;
  END IF;
  IF NEW.sequence_number IS NULL THEN
    NEW.sequence_number := coalesce(v_seq_int, 1);
  END IF;

  IF NEW.indent_id IS NOT NULL THEN
    IF NEW.source_indent_id IS NULL THEN
      NEW.source_indent_id := NEW.indent_id;
    END IF;
    IF NEW.source_indent_code IS NULL OR btrim(NEW.source_indent_code) = '' THEN
      SELECT coalesce(i.indent_code, i.display_indent_id, i.indent_number)
      INTO NEW.source_indent_code
      FROM public.indents i
      WHERE i.id = NEW.indent_id;
    END IF;
    IF NEW.converted_from_indent_at IS NULL THEN
      NEW.converted_from_indent_at := now();
    END IF;
    IF NEW.converted_by IS NULL THEN
      NEW.converted_by := auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_indent_operational_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_text text;
  v_seq_int integer;
  v_legacy text;
BEGIN
  IF NEW.indent_code IS NULL OR btrim(NEW.indent_code) = '' THEN
    NEW.indent_code := public.generate_operational_code(NEW.organization_id, 'indent');
  END IF;

  v_seq_text := substring(NEW.indent_code FROM '([0-9]+)$');
  v_seq_int := CASE WHEN v_seq_text IS NULL THEN NULL ELSE v_seq_text::integer END;
  v_legacy := 'IND' || lpad(coalesce(v_seq_int, 1)::text, 3, '0');

  IF NEW.indent_number IS NULL OR btrim(NEW.indent_number) = '' THEN
    NEW.indent_number := v_legacy;
  END IF;
  IF NEW.display_indent_id IS NULL OR btrim(NEW.display_indent_id) = '' THEN
    NEW.display_indent_id := v_legacy;
  END IF;
  IF NEW.sequence_number IS NULL THEN
    NEW.sequence_number := coalesce(v_seq_int, 1);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_vehicle_operational_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vehicle_code IS NULL OR btrim(NEW.vehicle_code) = '' THEN
    NEW.vehicle_code := public.generate_operational_code(NEW.organization_id, 'vehicle');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_driver_operational_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.driver_code IS NULL OR btrim(NEW.driver_code) = '' THEN
    NEW.driver_code := public.generate_operational_code(NEW.organization_id, 'driver');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_trip_number ON public.trips;
CREATE TRIGGER trg_set_trip_number
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_trip_operational_identity();

DROP TRIGGER IF EXISTS trg_set_indent_number ON public.indents;
CREATE TRIGGER trg_set_indent_number
  BEFORE INSERT ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_indent_operational_identity();

DROP TRIGGER IF EXISTS trg_set_vehicle_operational_identity ON public.vehicles;
CREATE TRIGGER trg_set_vehicle_operational_identity
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_vehicle_operational_identity();

DROP TRIGGER IF EXISTS trg_set_driver_operational_identity ON public.drivers;
CREATE TRIGGER trg_set_driver_operational_identity
  BEFORE INSERT ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_driver_operational_identity();

-- 6) Backfill existing rows (migration-safe, keeps old IDs and FK behavior).
WITH trip_ordered AS (
  SELECT
    t.id,
    t.organization_id,
    t.indent_id,
    row_number() OVER (
      PARTITION BY t.organization_id
      ORDER BY t.created_at NULLS LAST, t.id
    )::integer AS seq
  FROM public.trips t
)
UPDATE public.trips t
SET
  trip_code = coalesce(
    t.trip_code,
    upper(o.operational_code) || '-TRP-' || lpad(tr.seq::text, 3, '0')
  ),
  trip_number = coalesce(nullif(btrim(t.trip_number), ''), 'TRP' || lpad(tr.seq::text, 3, '0')),
  display_trip_id = coalesce(nullif(btrim(t.display_trip_id), ''), 'TRP' || lpad(tr.seq::text, 3, '0')),
  sequence_number = coalesce(t.sequence_number, tr.seq),
  source_indent_id = coalesce(t.source_indent_id, t.indent_id),
  source_indent_code = coalesce(
    nullif(btrim(t.source_indent_code), ''),
    i.indent_code,
    i.display_indent_id,
    i.indent_number
  ),
  converted_from_indent_at = CASE
    WHEN t.indent_id IS NOT NULL AND t.converted_from_indent_at IS NULL THEN t.created_at
    ELSE t.converted_from_indent_at
  END
FROM trip_ordered tr
JOIN public.organizations o ON o.id = tr.organization_id
LEFT JOIN public.indents i ON i.id = tr.indent_id
WHERE t.id = tr.id;

WITH indent_ordered AS (
  SELECT
    i.id,
    i.organization_id,
    row_number() OVER (
      PARTITION BY i.organization_id
      ORDER BY i.created_at NULLS LAST, i.id
    )::integer AS seq
  FROM public.indents i
)
UPDATE public.indents i
SET
  indent_code = coalesce(
    i.indent_code,
    upper(o.operational_code) || '-IND-' || lpad(io.seq::text, 3, '0')
  ),
  indent_number = coalesce(nullif(btrim(i.indent_number), ''), 'IND' || lpad(io.seq::text, 3, '0')),
  display_indent_id = coalesce(nullif(btrim(i.display_indent_id), ''), 'IND' || lpad(io.seq::text, 3, '0')),
  sequence_number = coalesce(i.sequence_number, io.seq)
FROM indent_ordered io
JOIN public.organizations o ON o.id = io.organization_id
WHERE i.id = io.id;

WITH vehicle_ordered AS (
  SELECT
    v.id,
    v.organization_id,
    row_number() OVER (
      PARTITION BY v.organization_id
      ORDER BY v.created_at NULLS LAST, v.id
    )::integer AS seq
  FROM public.vehicles v
)
UPDATE public.vehicles v
SET vehicle_code = coalesce(
  v.vehicle_code,
  upper(o.operational_code) || '-VEH-' || lpad(vo.seq::text, 3, '0')
)
FROM vehicle_ordered vo
JOIN public.organizations o ON o.id = vo.organization_id
WHERE v.id = vo.id;

WITH driver_ordered AS (
  SELECT
    d.id,
    d.organization_id,
    row_number() OVER (
      PARTITION BY d.organization_id
      ORDER BY d.created_at NULLS LAST, d.id
    )::integer AS seq
  FROM public.drivers d
)
UPDATE public.drivers d
SET driver_code = coalesce(
  d.driver_code,
  upper(o.operational_code) || '-DRV-' || lpad(do2.seq::text, 3, '0')
)
FROM driver_ordered do2
JOIN public.organizations o ON o.id = do2.organization_id
WHERE d.id = do2.id;

-- 7) Sync centralized counters from backfilled data.
WITH seq_max AS (
  SELECT organization_id, 'trip'::text AS entity_type,
         coalesce(max((regexp_match(trip_code, '([0-9]+)$'))[1]::bigint), 0) AS max_seq
  FROM public.trips
  WHERE trip_code IS NOT NULL
  GROUP BY organization_id
  UNION ALL
  SELECT organization_id, 'indent'::text AS entity_type,
         coalesce(max((regexp_match(indent_code, '([0-9]+)$'))[1]::bigint), 0) AS max_seq
  FROM public.indents
  WHERE indent_code IS NOT NULL
  GROUP BY organization_id
  UNION ALL
  SELECT organization_id, 'vehicle'::text AS entity_type,
         coalesce(max((regexp_match(vehicle_code, '([0-9]+)$'))[1]::bigint), 0) AS max_seq
  FROM public.vehicles
  WHERE vehicle_code IS NOT NULL
  GROUP BY organization_id
  UNION ALL
  SELECT organization_id, 'driver'::text AS entity_type,
         coalesce(max((regexp_match(driver_code, '([0-9]+)$'))[1]::bigint), 0) AS max_seq
  FROM public.drivers
  WHERE driver_code IS NOT NULL
  GROUP BY organization_id
)
INSERT INTO public.operational_sequences (organization_id, entity_type, current_value)
SELECT organization_id, entity_type, max_seq
FROM seq_max
ON CONFLICT (organization_id, entity_type)
DO UPDATE SET current_value = greatest(public.operational_sequences.current_value, EXCLUDED.current_value),
              updated_at = now();
