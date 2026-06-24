-- Phase A: opaque Sqids booking_ref, supplier_trip_counters, operational_code immutability.

-- ── app_config (Sqids alphabet shared with lib/sqids.ts) ─────────────────────

CREATE TABLE IF NOT EXISTS public.app_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_config_service_role ON public.app_config;
CREATE POLICY app_config_service_role
  ON public.app_config
  FOR ALL
  USING (auth.role() = 'service_role');

INSERT INTO public.app_config (key, value)
VALUES (
  'sqids_alphabet',
  'h4n0kxr7m2qj5w9v3p6f1tz8cbdysgauileo'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_sqids_alphabet()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(btrim((SELECT value FROM public.app_config WHERE key = 'sqids_alphabet')), ''),
    'h4n0kxr7m2qj5w9v3p6f1tz8cbdysgauileo'
  );
$$;

-- ── Sqids encode (mirrors npm sqids; blocklist skipped — numeric refs only) ──

CREATE OR REPLACE FUNCTION public.sqids_shuffle(p_alphabet text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  chars text[];
  len   int;
  e     int := 0;
  t     int;
  c     int;
  tmp   text;
BEGIN
  IF p_alphabet IS NULL OR length(p_alphabet) < 2 THEN
    RETURN coalesce(p_alphabet, '');
  END IF;
  chars := regexp_split_to_array(p_alphabet, '');
  len := coalesce(array_length(chars, 1), 0);
  t := len - 1;
  WHILE t > 0 LOOP
    c := (e * t + ascii(chars[e + 1]) + ascii(chars[t + 1])) % len;
    tmp := chars[e + 1];
    chars[e + 1] := chars[c + 1];
    chars[c + 1] := tmp;
    e := e + 1;
    t := t - 1;
  END LOOP;
  RETURN array_to_string(chars, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.sqids_working_alphabet()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.sqids_shuffle(public.get_sqids_alphabet());
$$;

CREATE OR REPLACE FUNCTION public.sqids_to_id(p_num bigint, p_alphabet text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  chars text[];
  len   int;
  n     bigint;
  rem   int;
  out   text := '';
BEGIN
  IF p_alphabet IS NULL OR length(p_alphabet) < 1 THEN
    RETURN '';
  END IF;
  chars := regexp_split_to_array(p_alphabet, '');
  len := coalesce(array_length(chars, 1), 0);
  n := p_num;
  IF n < 0 THEN
    RAISE EXCEPTION 'sqids_to_id: negative number %', p_num;
  END IF;
  LOOP
    rem := (n % len)::int;
    out := chars[rem + 1] || out;
    n := n / len;
    EXIT WHEN n = 0;
  END LOOP;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.sqids_encode_numbers(
  p_numbers bigint[],
  p_attempt int DEFAULT 0,
  p_min_length int DEFAULT 6
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet text;
  len      int;
  v_offset int := 0;
  i        int;
  c        text;
  parts    text[] := ARRAY[]::text[];
  result   text;
  num      bigint;
BEGIN
  IF p_numbers IS NULL OR array_length(p_numbers, 1) IS NULL THEN
    RETURN '';
  END IF;

  alphabet := public.sqids_working_alphabet();
  len := length(alphabet);
  IF len < 3 THEN
    RAISE EXCEPTION 'sqids alphabet too short';
  END IF;

  IF p_attempt > len THEN
    RAISE EXCEPTION 'sqids_encode_numbers: max attempts exceeded';
  END IF;

  FOR i IN 1..array_length(p_numbers, 1) LOOP
    num := p_numbers[i];
    IF num < 0 THEN
      RAISE EXCEPTION 'sqids_encode_numbers: negative value at index %', i;
    END IF;
    v_offset := v_offset + (ascii(substr(alphabet, (num % len)::int + 1, 1)) + (i - 1));
  END LOOP;
  v_offset := (v_offset + array_length(p_numbers, 1)) % len;
  v_offset := (v_offset + p_attempt) % len;

  c := substr(alphabet, v_offset + 1) || substr(alphabet, 1, v_offset);
  parts := array_append(parts, substr(c, 1, 1));
  c := reverse(c);

  FOR i IN 1..array_length(p_numbers, 1) LOOP
    parts := array_append(parts, public.sqids_to_id(p_numbers[i], c));
    IF i < array_length(p_numbers, 1) THEN
      parts := array_append(parts, substr(c, 1, 1));
      c := public.sqids_shuffle(c);
    END IF;
  END LOOP;

  result := array_to_string(parts, '');

  IF p_min_length > length(result) THEN
    result := result || substr(c, 1, 1);
    WHILE p_min_length - length(result) > 0 LOOP
      c := public.sqids_shuffle(c);
      result := result || substr(c, 1, least(p_min_length - length(result), length(c)));
    END LOOP;
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sqids_encode_id(p_num bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.sqids_encode_numbers(ARRAY[p_num]::bigint[], 0, 6);
$$;

CREATE OR REPLACE FUNCTION public.sqids_encode_booking_ref(p_num bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'BKG-' || public.sqids_encode_id(p_num);
$$;

-- ── booking_ref trigger (opaque Sqids; indent-linked trips only) ─────────────

CREATE SEQUENCE IF NOT EXISTS public.booking_ref_seq START 1;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS supplier_trip_sequence integer;

CREATE UNIQUE INDEX IF NOT EXISTS trips_booking_ref_unique
  ON public.trips (booking_ref)
  WHERE booking_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.booking_ref_backfill_log (
  old_ref      text NOT NULL,
  new_ref      text NOT NULL,
  trip_id      uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  migrated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_ref_backfill_log_old
  ON public.booking_ref_backfill_log (old_ref);

ALTER TABLE public.booking_ref_backfill_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_ref_backfill_log_service ON public.booking_ref_backfill_log;
CREATE POLICY booking_ref_backfill_log_service
  ON public.booking_ref_backfill_log
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.trg_set_booking_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq bigint;
BEGIN
  IF NEW.booking_ref IS NOT NULL AND btrim(NEW.booking_ref) <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.source_indent_id IS NULL AND NEW.indent_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_seq := nextval('public.booking_ref_seq');
  NEW.booking_ref := public.sqids_encode_booking_ref(v_seq);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_set_booking_ref ON public.trips;
DROP FUNCTION IF EXISTS public.set_trip_booking_ref();

CREATE TRIGGER trips_set_booking_ref
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_booking_ref();

-- Backfill legacy BKG-000042 → BKG-{sqids(42)}
DO $$
DECLARE
  r RECORD;
  v_seq bigint;
  v_new text;
BEGIN
  FOR r IN
    SELECT id, booking_ref
    FROM public.trips
    WHERE booking_ref IS NOT NULL
      AND booking_ref ~ '^BKG-[0-9]+$'
    ORDER BY created_at NULLS LAST, id
  LOOP
    v_seq := (regexp_replace(r.booking_ref, '^BKG-', ''))::bigint;
    v_new := public.sqids_encode_booking_ref(v_seq);

    INSERT INTO public.booking_ref_backfill_log (old_ref, new_ref, trip_id)
    VALUES (r.booking_ref, v_new, r.id);

    UPDATE public.trips
    SET booking_ref = v_new
    WHERE id = r.id;
  END LOOP;

  -- Indent-linked trips missing booking_ref
  FOR r IN
    SELECT id
    FROM public.trips
    WHERE booking_ref IS NULL
      AND (indent_id IS NOT NULL OR source_indent_id IS NOT NULL)
    ORDER BY created_at NULLS LAST, id
  LOOP
    v_seq := nextval('public.booking_ref_seq');
    v_new := public.sqids_encode_booking_ref(v_seq);
    UPDATE public.trips SET booking_ref = v_new WHERE id = r.id;
  END LOOP;
END;
$$;

-- Sync sequence to highest numeric booking ref issued
SELECT setval(
  'public.booking_ref_seq',
  greatest(
    coalesce((
      SELECT max((regexp_replace(old_ref, '^BKG-', ''))::bigint)
      FROM public.booking_ref_backfill_log
      WHERE old_ref ~ '^BKG-[0-9]+$'
    ), 0),
    coalesce((
      SELECT last_value::bigint
      FROM pg_sequences
      WHERE schemaname = 'public'
        AND sequencename = 'booking_ref_seq'
    ), 0)
  ),
  true
);

-- ── supplier_trip_counters ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_trip_counters (
  supplier_org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  seq             integer NOT NULL DEFAULT 0
);

ALTER TABLE public.supplier_trip_counters ENABLE ROW LEVEL SECURITY;

-- No direct client access; SECURITY DEFINER functions only.

CREATE OR REPLACE FUNCTION public.increment_supplier_trip_seq(p_supplier_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  IF p_supplier_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.supplier_trip_counters (supplier_org_id, seq)
  VALUES (p_supplier_org_id, 1)
  ON CONFLICT (supplier_org_id) DO UPDATE
    SET seq = public.supplier_trip_counters.seq + 1
  RETURNING seq INTO v_seq;

  RETURN v_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_supplier_trip_seq(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_supplier_trip_seq(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_supplier_trip_seq(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.trg_set_supplier_trip_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier_org_id uuid;
BEGIN
  IF NEW.supplier_trip_sequence IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.indent_id IS NULL AND NEW.source_indent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.linked_organization_id
  INTO v_supplier_org_id
  FROM public.suppliers s
  WHERE s.id = NEW.supplier_id;

  IF v_supplier_org_id IS NOT NULL THEN
    NEW.supplier_trip_sequence := public.increment_supplier_trip_seq(v_supplier_org_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_supplier_trip_sequence ON public.trips;
CREATE TRIGGER trg_set_supplier_trip_sequence
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_supplier_trip_sequence();

-- Backfill supplier_trip_sequence for existing indent-linked trips (per supplier org, by created_at)
WITH ranked AS (
  SELECT
    t.id,
    s.linked_organization_id AS supplier_org_id,
    row_number() OVER (
      PARTITION BY s.linked_organization_id
      ORDER BY t.created_at NULLS LAST, t.id
    )::integer AS rn
  FROM public.trips t
  JOIN public.suppliers s ON s.id = t.supplier_id
  WHERE t.indent_id IS NOT NULL
    AND s.linked_organization_id IS NOT NULL
    AND t.supplier_trip_sequence IS NULL
    AND lower(coalesce(t.status, '')) <> 'cancelled'
)
UPDATE public.trips t
SET supplier_trip_sequence = ranked.rn
FROM ranked
WHERE t.id = ranked.id;

INSERT INTO public.supplier_trip_counters (supplier_org_id, seq)
SELECT supplier_org_id, max(rn)
FROM (
  SELECT
    s.linked_organization_id AS supplier_org_id,
    coalesce(t.supplier_trip_sequence, 0) AS rn
  FROM public.trips t
  JOIN public.suppliers s ON s.id = t.supplier_id
  WHERE t.indent_id IS NOT NULL
    AND s.linked_organization_id IS NOT NULL
    AND lower(coalesce(t.status, '')) <> 'cancelled'
) x
WHERE supplier_org_id IS NOT NULL
GROUP BY supplier_org_id
ON CONFLICT (supplier_org_id) DO UPDATE
  SET seq = greatest(public.supplier_trip_counters.seq, EXCLUDED.seq);

-- ── operational_code immutability ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_block_operational_code_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.operational_code IS DISTINCT FROM NEW.operational_code THEN
    RAISE EXCEPTION 'organizations.operational_code is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_operational_code_change ON public.organizations;
CREATE TRIGGER block_operational_code_change
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_operational_code_change();

DO $$
DECLARE
  v_org RECORD;
BEGIN
  FOR v_org IN
    SELECT id
    FROM public.organizations
    WHERE operational_code IS NULL OR btrim(operational_code) = ''
  LOOP
    PERFORM public.ensure_organization_operational_code(v_org.id);
  END LOOP;
END;
$$;
