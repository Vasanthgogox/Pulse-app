-- Trip and indent display sequences: TRP001 / IND001 (per-org, O(1) per insert).
-- Replaces date-based TRP-YYYYMMDD-00002 / IND-YYYYMMDD-00002 format.
-- Backfill existing rows in O(n) and sync organization_counters.

-- ---------------------------------------------------------------------------
-- 1. Trigger functions: simple format, O(1) per insert (single UPDATE...RETURNING)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_indent_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  -- Only auto-set when null or blank (preserve explicit values)
  IF NEW.indent_number IS NULL OR trim(NEW.indent_number) = '' THEN
    INSERT INTO public.organization_counters (organization_id)
    VALUES (NEW.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
    UPDATE public.organization_counters
    SET indent_seq = indent_seq + 1
    WHERE organization_id = NEW.organization_id
    RETURNING indent_seq INTO seq;
    NEW.indent_number := 'IND' || lpad(seq::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_trip_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.trip_number IS NULL OR trim(NEW.trip_number) = '' THEN
    INSERT INTO public.organization_counters (organization_id)
    VALUES (NEW.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
    UPDATE public.organization_counters
    SET trip_seq = trip_seq + 1
    WHERE organization_id = NEW.organization_id
    RETURNING trip_seq INTO seq;
    NEW.trip_number := 'TRP' || lpad(seq::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Backfill existing rows (O(n)) and sync counters
-- ---------------------------------------------------------------------------

-- Trips: assign TRP001, TRP002, ... per org by created_at, id. Single UPDATE.
UPDATE public.trips t
SET trip_number = 'TRP' || lpad(sub.ord::text, 3, '0')
FROM (
  SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at NULLS LAST, id) AS ord
  FROM public.trips
) sub
WHERE t.id = sub.id;

-- Indents: assign IND001, IND002, ... per org. Single UPDATE.
UPDATE public.indents i
SET indent_number = 'IND' || lpad(sub.ord::text, 3, '0')
FROM (
  SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at NULLS LAST, id) AS ord
  FROM public.indents
) sub
WHERE i.id = sub.id;

-- Sync trip_seq so next insert gets max(ord)+1. O(1) per org.
UPDATE public.organization_counters oc
SET trip_seq = sub.max_seq
FROM (
  SELECT organization_id, coalesce(max(ord), 0)::bigint AS max_seq
  FROM (
    SELECT organization_id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at NULLS LAST, id) AS ord
    FROM public.trips
  ) x
  GROUP BY organization_id
) sub
WHERE oc.organization_id = sub.organization_id
  AND oc.trip_seq < sub.max_seq;

-- Sync indent_seq so next insert gets max(ord)+1.
UPDATE public.organization_counters oc
SET indent_seq = sub.max_seq
FROM (
  SELECT organization_id, coalesce(max(ord), 0)::bigint AS max_seq
  FROM (
    SELECT organization_id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at NULLS LAST, id) AS ord
    FROM public.indents
  ) x
  GROUP BY organization_id
) sub
WHERE oc.organization_id = sub.organization_id
  AND oc.indent_seq < sub.max_seq;

-- Orgs with trips/indents but no counter row (edge case: data imported or counter missing).
INSERT INTO public.organization_counters (organization_id, trip_seq, indent_seq)
SELECT org_id, trip_max, indent_max
FROM (
  SELECT
    o.id AS org_id,
    coalesce(t.trip_max, 0)::bigint AS trip_max,
    coalesce(i.indent_max, 0)::bigint AS indent_max
  FROM public.organizations o
  LEFT JOIN (
    SELECT organization_id, max(ord) AS trip_max
    FROM (
      SELECT organization_id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at NULLS LAST, id) AS ord
      FROM public.trips
    ) x
    GROUP BY organization_id
  ) t ON t.organization_id = o.id
  LEFT JOIN (
    SELECT organization_id, max(ord) AS indent_max
    FROM (
      SELECT organization_id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at NULLS LAST, id) AS ord
      FROM public.indents
    ) y
    GROUP BY organization_id
  ) i ON i.organization_id = o.id
  WHERE o.id IN (SELECT organization_id FROM public.trips)
     OR o.id IN (SELECT organization_id FROM public.indents)
) combined
WHERE NOT EXISTS (SELECT 1 FROM public.organization_counters oc WHERE oc.organization_id = combined.org_id)
ON CONFLICT (organization_id) DO UPDATE SET
  trip_seq = greatest(organization_counters.trip_seq, EXCLUDED.trip_seq),
  indent_seq = greatest(organization_counters.indent_seq, EXCLUDED.indent_seq);
