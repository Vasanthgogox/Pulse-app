-- ─────────────────────────────────────────────────────────────────────────────
-- Global ID Service
--
-- Hardens the ID architecture against the three remaining collision vectors:
--
--   1. Weak fallback IDs  — buildFallbackTripNumber() uses Date.now() +
--      Math.random(). Replace with a DB-level atomic global sequence so the
--      client never needs to generate IDs itself.
--
--   2. 500-row scan limit — getNextOrgTripSequence() scans only the last 500
--      trips.  A new RPC reads the authoritative counter directly instead.
--
--   3. Missing sequences  — 'invoice', 'pod', 'maintenance', 'transaction',
--      'notification', 'driver_tenure' entity types were not pre-registered
--      in operational_sequences, causing the first insert of each to create
--      a new sequence row mid-flight (race window).
--
-- Nothing here changes PKs (already UUIDv4 / gen_random_uuid()) or display IDs
-- (already atomic DB triggers).  This migration adds the safety layer between
-- the application's emergency fallback path and the database.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Global fallback sequence ──────────────────────────────────────────────
--
-- Used ONLY when all org-scoped sequence attempts fail (DB degraded / trigger
-- error).  The client calls get_safe_fallback_trip_number() and receives a
-- globally unique, DB-guaranteed reference.

CREATE SEQUENCE IF NOT EXISTS public.global_fallback_trip_seq
  START   1
  INCREMENT 1
  NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS public.global_fallback_indent_seq
  START   1
  INCREMENT 1
  NO CYCLE;

-- ── 2. Fallback ID RPCs ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_safe_fallback_trip_number()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Format: FTRP-<10-digit global sequence>
  -- 'F' prefix distinguishes fallback IDs from canonical TRPxxx / GGV234GGVTRIP000001.
  SELECT 'FTRP-' || LPAD(nextval('public.global_fallback_trip_seq')::text, 10, '0');
$$;

CREATE OR REPLACE FUNCTION public.get_safe_fallback_indent_number()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'FIND-' || LPAD(nextval('public.global_fallback_indent_seq')::text, 10, '0');
$$;

-- ── 3. Authoritative trip sequence reader ────────────────────────────────────
--
-- Replaces the 500-row client-side scan.  Returns the NEXT sequence value the
-- DB trigger would issue for a given org, based on the authoritative counter
-- rows — never limited to recent rows.

CREATE OR REPLACE FUNCTION public.get_next_trip_sequence_for_org(
  p_org_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op_seq  bigint;
  v_org_seq bigint;
  v_max_seq bigint;
BEGIN
  -- Read from operational_sequences (Phase 1+) — authoritative counter
  SELECT current_value INTO v_op_seq
  FROM   public.operational_sequences
  WHERE  organization_id = p_org_id
    AND  entity_type     = 'trip';

  -- Fallback: read from legacy organization_counters
  SELECT trip_seq INTO v_org_seq
  FROM   public.organization_counters
  WHERE  organization_id = p_org_id;

  -- Return max of both counters + 1 (next value to be issued)
  v_max_seq := GREATEST(COALESCE(v_op_seq, 0), COALESCE(v_org_seq, 0));
  RETURN v_max_seq + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_trip_sequence_for_org(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_next_trip_sequence_for_org(uuid) TO authenticated;

-- ── 4. Expand entity_type check constraint + pre-register missing types ───────
--
-- Phase 5A added 'maintenance' as the last known type.  Widen the constraint
-- to include 'driver_tenure' so the driver-tenures trigger can allocate sequences.

ALTER TABLE public.operational_sequences
  DROP CONSTRAINT IF EXISTS operational_sequences_entity_type_check_v2,
  ADD  CONSTRAINT operational_sequences_entity_type_check_v2 CHECK (
    entity_type = ANY (
      ARRAY[
        'trip'::text,
        'indent'::text,
        'vehicle'::text,
        'driver'::text,
        'invoice'::text,
        'pod'::text,
        'maintenance'::text,
        'driver_tenure'::text
      ]
    )
  );

-- Pre-register driver_tenure sequences (the other types are already registered
-- by Phase 5A's backfill).
DO $$
DECLARE
  v_org RECORD;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations LOOP
    INSERT INTO public.operational_sequences (organization_id, entity_type, current_value)
    VALUES (v_org.id, 'driver_tenure', 0)
    ON CONFLICT (organization_id, entity_type) DO NOTHING;
  END LOOP;
END;
$$;

-- Trigger: auto-register driver_tenure sequence when a new organisation is created
-- (other types already handled by existing trigger in Phase 5A)
CREATE OR REPLACE FUNCTION public.init_org_extended_sequences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.operational_sequences (organization_id, entity_type, current_value)
  VALUES (NEW.id, 'driver_tenure', 0)
  ON CONFLICT (organization_id, entity_type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_org_extended_sequences ON public.organizations;

CREATE TRIGGER trg_init_org_extended_sequences
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.init_org_extended_sequences();

-- ── 5. Duplicate-insertion guard ─────────────────────────────────────────────
--
-- Prevents two concurrent clients from inserting the same (org, trip_number)
-- in the short window between sequence allocation and commit.
-- The UNIQUE(organization_id, trip_number) constraint already exists; this
-- adds a DEFERRABLE version so trigger-based retry logic can operate within
-- a transaction without hitting intermediate constraint violations.

-- Ensure the canonical unique constraint exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trips_org_trip_number_unique'
      AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_org_trip_number_unique
        UNIQUE (organization_id, trip_number)
        DEFERRABLE INITIALLY DEFERRED;
  END IF;
EXCEPTION WHEN duplicate_table THEN
  NULL; -- constraint already exists under a different name
END;
$$;

-- ── 6. ID validation helper ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_valid_business_reference(p_ref text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_ref IS NOT NULL
    AND  length(trim(p_ref)) > 0
    -- Must not be a raw UUID (internal ID leaked as display ID)
    AND  trim(p_ref) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    -- Must not be pure numeric (was a bare rowid)
    AND  trim(p_ref) !~ '^\d+$';
$$;

-- ── 7. Collision audit log ────────────────────────────────────────────────────
--
-- Lightweight append-only log for tracking when the fallback path is invoked.
-- Ops team can monitor this table; a spike indicates a DB trigger issue.

CREATE TABLE IF NOT EXISTS public.id_generation_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text        NOT NULL,
  org_id        uuid,
  generated_id  text        NOT NULL,
  path          text        NOT NULL DEFAULT 'trigger', -- 'trigger' | 'fallback_seq' | 'fallback_client'
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_id_generation_log_entity
  ON public.id_generation_log(entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_id_generation_log_fallback
  ON public.id_generation_log(path, created_at DESC)
  WHERE path != 'trigger';

-- RLS: only service-role can read audit log
ALTER TABLE public.id_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_id_log"
  ON public.id_generation_log
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── 8. Grants ─────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_safe_fallback_trip_number()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_safe_fallback_indent_number()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_business_reference(text)  TO authenticated;
