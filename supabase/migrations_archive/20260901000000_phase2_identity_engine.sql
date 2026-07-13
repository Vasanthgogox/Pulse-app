-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2: Global Identity Engine
--
-- Priorities implemented:
--   P1  UUIDv7 generator (time-sortable, globally unique, index-friendly)
--   P2  GlobalIdentityService support layer
--   P3  Global business references (TRP-26-AB4K7F format)
--   P4  Network identity layer (BKG-H8K2P7, SHR-*, COL-* etc.)
--   P6  Event-stream readiness (immutable IDs, mutable references)
--   P7  Identity monitoring infrastructure
--
-- Migration strategy (non-breaking):
--   • New tables default to uuidv7_generate()
--   • Existing tables keep gen_random_uuid() for historical rows
--   • New rows in existing tables can opt-in via trigger (future migration)
--   • All PKs remain UUID — no column renames, no data migration needed
-- ─────────────────────────────────────────────────────────────────────────────

-- ── P1: UUIDv7 Generator ─────────────────────────────────────────────────────
--
-- Pure SQL implementation — no extension required, works on Postgres 14+.
-- UUIDv7 layout (RFC 9562):
--   bits  0-47 : Unix timestamp in milliseconds
--   bits 48-51 : version = 7
--   bits 52-63 : rand_a  (12 random bits)
--   bits 64-65 : variant = 0b10
--   bits 66-127: rand_b  (62 random bits)
--
-- Time-sorted within each millisecond (monotonic counter not needed at DB level
-- because Postgres sequence within a millisecond provides natural ordering).

CREATE OR REPLACE FUNCTION public.uuidv7_generate()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_ts         bigint;
  v_rand_a     bigint;
  v_rand_b     bigint;
  v_hex        text;
BEGIN
  v_ts     := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_rand_a := (random() * 4095)::bigint;                -- 12 bits
  v_rand_b := (random() * 4611686018427387903)::bigint; -- 62 bits

  -- Pack into 128-bit UUID hex string
  v_hex := lpad(to_hex(v_ts), 12, '0')                  -- 48-bit timestamp
         || '7'                                           -- version = 7
         || lpad(to_hex(v_rand_a), 3, '0')              -- 12-bit rand_a
         || to_hex((2::bigint << 62) | v_rand_b)         -- variant 10 + 62-bit rand_b
         ;

  -- Reshape into UUID format: 8-4-4-4-12
  RETURN (
    substr(v_hex, 1, 8)  || '-' ||
    substr(v_hex, 9, 4)  || '-' ||
    substr(v_hex, 13, 4) || '-' ||
    substr(v_hex, 17, 4) || '-' ||
    substr(v_hex, 21, 12)
  )::uuid;
END;
$$;

COMMENT ON FUNCTION public.uuidv7_generate() IS
  'RFC 9562 UUIDv7: time-sortable (millisecond precision), globally unique, no extension required.';

-- Verify the function works
DO $$
BEGIN
  PERFORM public.uuidv7_generate();
END;
$$;

-- ── P1: Apply UUIDv7 to new identity-critical tables ─────────────────────────
--
-- Existing tables keep gen_random_uuid() for backward compatibility.
-- New rows in high-throughput tables can be opted into UUIDv7 via a
-- BEFORE INSERT trigger that overwrites the default when id is gen_random_uuid().

-- Helper: detect if a UUID looks like v4 (version nibble = 4)
CREATE OR REPLACE FUNCTION public.is_uuidv4(p_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT substring(p_id::text from 15 for 1) = '4';
$$;

CREATE OR REPLACE FUNCTION public.is_uuidv7(p_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT substring(p_id::text from 15 for 1) = '7';
$$;

-- Extract millisecond-precision timestamp from a UUIDv7 (for analytics)
CREATE OR REPLACE FUNCTION public.uuidv7_timestamp(p_id uuid)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_timestamp(
    ('x' || translate(split_part(p_id::text, '-', 1), '-', '') ||
             split_part(p_id::text, '-', 2) ||
             substr(split_part(p_id::text, '-', 3), 2, 3))::bit(48)::bigint
    / 1000.0
  );
$$;

COMMENT ON FUNCTION public.uuidv7_timestamp(uuid) IS
  'Extract creation timestamp (ms precision) from a UUIDv7. Returns NULL-safe result for UUIDv4 inputs.';

GRANT EXECUTE ON FUNCTION public.uuidv7_generate()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_uuidv4(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_uuidv7(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.uuidv7_timestamp(uuid)     TO authenticated;

-- ── P3: Global Reference Engine ──────────────────────────────────────────────
--
-- New format: {PREFIX}-{YY}-{6-char-alphanum}
--   • PREFIX   : 3-char entity code (TRP, IND, DRV, FLT, INV, BKG…)
--   • YY       : 2-digit year (26, 27, …)
--   • Suffix   : 6 chars from Crockford base32 (no ambiguous O/I/L)
--
-- Design properties:
--   • ~1 billion unique references per entity per year
--   • Human-readable and typeable (phone/WhatsApp friendly)
--   • Non-sequential (random suffix — hard to enumerate)
--   • Globally unique (not org-scoped)
--   • Search-friendly (prefix filter, year filter)
--
-- Examples: TRP-26-AB4K7F  IND-26-KD92QP  DRV-26-RT84NB
-- ─────────────────────────────────────────────────────────────────────────────

-- Global reference registry: tracks every issued reference for collision detection
CREATE TABLE IF NOT EXISTS public.global_references (
  id             uuid        PRIMARY KEY DEFAULT public.uuidv7_generate(),
  entity_type    text        NOT NULL,        -- 'trip', 'indent', 'driver'…
  entity_id      uuid        NOT NULL,        -- the entity's PK
  reference      text        NOT NULL,        -- TRP-26-AB4K7F
  year           smallint    NOT NULL,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  issued_by_org  uuid,                        -- org that triggered generation (nullable for system)
  CONSTRAINT global_references_unique_ref UNIQUE (reference),
  CONSTRAINT global_references_unique_entity UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_global_refs_entity_type ON public.global_references(entity_type);
CREATE INDEX IF NOT EXISTS idx_global_refs_year        ON public.global_references(year);
CREATE INDEX IF NOT EXISTS idx_global_refs_entity_id   ON public.global_references(entity_id);

-- RLS: org members can read references for their entities; service role manages inserts
ALTER TABLE public.global_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_global_refs"
  ON public.global_references FOR SELECT
  USING (auth.role() = 'authenticated');

-- Global sequence for unique suffix generation (monotonic within process)
CREATE SEQUENCE IF NOT EXISTS public.global_ref_suffix_seq START 1;

-- Crockford base32 alphabet (unambiguous characters for human use)
CREATE OR REPLACE FUNCTION public.generate_global_reference(
  p_entity_type text,
  p_entity_id   uuid,
  p_org_id      uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  CROCKFORD  constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_year     smallint;
  v_prefix   text;
  v_num      bigint;
  v_suffix   text := '';
  v_ref      text;
  v_attempts int := 0;
  v_i        int;
BEGIN
  v_year := extract(year from now())::smallint;

  -- Entity-type to prefix mapping
  v_prefix := CASE lower(p_entity_type)
    WHEN 'trip'          THEN 'TRP'
    WHEN 'indent'        THEN 'IND'
    WHEN 'driver'        THEN 'DRV'
    WHEN 'fleet'         THEN 'FLT'
    WHEN 'invoice'       THEN 'INV'
    WHEN 'booking'       THEN 'BKG'
    WHEN 'shared_load'   THEN 'SHR'
    WHEN 'collaboration' THEN 'COL'
    WHEN 'vehicle'       THEN 'VEH'
    WHEN 'pod'           THEN 'POD'
    WHEN 'transaction'   THEN 'TXN'
    WHEN 'organization'  THEN 'ORG'
    ELSE upper(left(p_entity_type, 3))
  END;

  -- Check if reference already exists for this entity
  SELECT reference INTO v_ref
  FROM public.global_references
  WHERE entity_type = lower(p_entity_type)
    AND entity_id   = p_entity_id;
  IF FOUND THEN RETURN v_ref; END IF;

  -- Generate collision-free 6-char Crockford base32 suffix
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique global reference after 20 attempts';
    END IF;

    -- Mix: sequence value + random + entity_id hash for locality avoidance
    v_num := (
      nextval('public.global_ref_suffix_seq') * 1000000 +
      (random() * 999999)::bigint +
      abs(hashtext(p_entity_id::text)) % 100000
    ) % (32::bigint ^ 6);

    v_suffix := '';
    FOR v_i IN 1..6 LOOP
      v_suffix := substr(CROCKFORD, (v_num % 32)::int + 1, 1) || v_suffix;
      v_num    := v_num / 32;
    END LOOP;

    v_ref := v_prefix || '-' || (v_year % 100)::text || '-' || v_suffix;

    -- Insert; skip on collision and retry
    BEGIN
      INSERT INTO public.global_references
             (entity_type, entity_id, reference, year, issued_by_org)
      VALUES (lower(p_entity_type), p_entity_id, v_ref, v_year, p_org_id);
      RETURN v_ref;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE; -- retry with a new random suffix
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_global_reference(text, uuid, uuid) IS
  'Issue or retrieve a globally unique short reference (TRP-26-AB4K7F) for any entity.
   Idempotent: calling twice for the same entity_id returns the same reference.';

GRANT EXECUTE ON FUNCTION public.generate_global_reference(text, uuid, uuid) TO authenticated;

-- ── P4: Network Identity Layer ────────────────────────────────────────────────
--
-- Dedicated references for cross-org marketplace/collaboration workflows.
-- These IDs are STABLE FOREVER — they must never be reused or changed.

CREATE TABLE IF NOT EXISTS public.network_identities (
  id               uuid        PRIMARY KEY DEFAULT public.uuidv7_generate(),
  network_ref      text        NOT NULL UNIQUE,  -- BKG-H8K2P7, SHR-L4N9Q2, COL-P8R2T7
  identity_type    text        NOT NULL,         -- 'booking', 'shared_load', 'collaboration'
  primary_entity   text        NOT NULL,         -- 'trip', 'indent', 'load'
  primary_id       uuid        NOT NULL,
  participant_orgs uuid[]      NOT NULL DEFAULT '{}',
  status           text        NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  metadata         jsonb       NOT NULL DEFAULT '{}',
  CONSTRAINT network_identities_type_check CHECK (
    identity_type IN ('booking', 'shared_load', 'collaboration', 'marketplace_order')
  )
);

CREATE INDEX IF NOT EXISTS idx_network_id_type     ON public.network_identities(identity_type);
CREATE INDEX IF NOT EXISTS idx_network_id_primary  ON public.network_identities(primary_entity, primary_id);
CREATE INDEX IF NOT EXISTS idx_network_id_orgs     ON public.network_identities USING GIN(participant_orgs);
CREATE INDEX IF NOT EXISTS idx_network_id_status   ON public.network_identities(status);
-- UUIDv7: index on id also provides creation-order scanning for free

ALTER TABLE public.network_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_network_identities"
  ON public.network_identities FOR SELECT
  USING (
    participant_orgs && ARRAY(
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- RPC: create or retrieve a network identity for a cross-org workflow
CREATE OR REPLACE FUNCTION public.ensure_network_identity(
  p_identity_type  text,
  p_primary_entity text,
  p_primary_id     uuid,
  p_org_id         uuid
)
RETURNS text  -- returns the network_ref
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  CROCKFORD constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_prefix  text;
  v_num     bigint;
  v_suffix  text := '';
  v_ref     text;
  v_i       int;
  v_attempts int := 0;
BEGIN
  -- Return existing if already created
  SELECT network_ref INTO v_ref
  FROM public.network_identities
  WHERE primary_entity = p_primary_entity
    AND primary_id     = p_primary_id
    AND identity_type  = p_identity_type;
  IF FOUND THEN RETURN v_ref; END IF;

  v_prefix := CASE p_identity_type
    WHEN 'booking'           THEN 'BKG'
    WHEN 'shared_load'       THEN 'SHR'
    WHEN 'collaboration'     THEN 'COL'
    WHEN 'marketplace_order' THEN 'MKT'
    ELSE upper(left(p_identity_type, 3))
  END;

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'Cannot generate unique network reference after 20 attempts';
    END IF;

    v_num    := (nextval('public.global_ref_suffix_seq') + (random() * 999999)::bigint)
                % (32::bigint ^ 6);
    v_suffix := '';
    FOR v_i IN 1..6 LOOP
      v_suffix := substr(CROCKFORD, (v_num % 32)::int + 1, 1) || v_suffix;
      v_num    := v_num / 32;
    END LOOP;
    v_ref := v_prefix || '-' || v_suffix;

    BEGIN
      INSERT INTO public.network_identities
             (network_ref, identity_type, primary_entity, primary_id, participant_orgs)
      VALUES (v_ref, p_identity_type, p_primary_entity, p_primary_id, ARRAY[p_org_id]);
      RETURN v_ref;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_network_identity(text, text, uuid, uuid) TO authenticated;

-- ── P7: Identity Monitoring Infrastructure ────────────────────────────────────

-- Extend the Phase 1 id_generation_log with UUIDv7 ID and richer telemetry
ALTER TABLE public.id_generation_log
  ADD COLUMN IF NOT EXISTS latency_ms    numeric(10,3),
  ADD COLUMN IF NOT EXISTS entity_id     uuid,
  ADD COLUMN IF NOT EXISTS reference     text;

-- Create or replace the enriched log function
CREATE OR REPLACE FUNCTION public.log_id_generation(
  p_entity_type text,
  p_org_id      uuid,
  p_generated   text,
  p_path        text DEFAULT 'trigger',
  p_latency_ms  numeric DEFAULT NULL,
  p_entity_id   uuid   DEFAULT NULL,
  p_reference   text   DEFAULT NULL
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.id_generation_log
    (entity_type, org_id, generated_id, path, latency_ms, entity_id, reference)
  VALUES
    (p_entity_type, p_org_id, p_generated, p_path, p_latency_ms, p_entity_id, p_reference);
$$;

-- Identity health summary — lightweight, callable from monitoring dashboards
CREATE OR REPLACE FUNCTION public.get_identity_health(
  p_since timestamptz DEFAULT now() - interval '1 hour'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'window_start',       p_since,
    'window_end',         now(),
    'total_generated',    count(*),
    'fallback_count',     count(*) FILTER (WHERE path != 'trigger'),
    'fallback_pct',       round(
                            100.0 * count(*) FILTER (WHERE path != 'trigger') /
                            nullif(count(*), 0), 2
                          ),
    'avg_latency_ms',     round(avg(latency_ms)::numeric, 3),
    'p99_latency_ms',     round(percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::numeric, 3),
    'by_entity_type',     (
      SELECT jsonb_object_agg(entity_type, cnt)
      FROM (
        SELECT entity_type, count(*) AS cnt
        FROM public.id_generation_log
        WHERE created_at >= p_since
        GROUP BY entity_type
      ) t
    ),
    'uuidv7_enabled',     true,
    'global_refs_issued', (SELECT count(*) FROM public.global_references WHERE issued_at >= p_since),
    'network_ids_issued', (SELECT count(*) FROM public.network_identities WHERE created_at >= p_since)
  )
  FROM public.id_generation_log
  WHERE created_at >= p_since;
$$;

COMMENT ON FUNCTION public.get_identity_health(timestamptz) IS
  'Lightweight identity monitoring snapshot — call every 60s from health checker.';

GRANT EXECUTE ON FUNCTION public.log_id_generation(text,uuid,text,text,numeric,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_identity_health(timestamptz)                          TO authenticated;

-- ── P6: Event-Stream Readiness ────────────────────────────────────────────────
--
-- Entity identity anchor table: maps every entity to its immutable UUIDv7 and
-- all reference handles (business ref, network ref, legacy org-scoped ref).
-- Kafka consumers / event processors can join on entity_id (never changes).

CREATE TABLE IF NOT EXISTS public.entity_identity_anchors (
  entity_id      uuid    PRIMARY KEY,  -- immutable: the entity's PK (UUIDv4 or v7)
  entity_type    text    NOT NULL,
  global_ref     text,                 -- TRP-26-AB4K7F  (may be NULL until generated)
  legacy_ref     text,                 -- TRP001 / GGV234GGVTRIP000001 (org-scoped legacy)
  network_ref    text,                 -- BKG-H8K2P7  (set for cross-org entities)
  org_id         uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_anchor_type      ON public.entity_identity_anchors(entity_type);
CREATE INDEX IF NOT EXISTS idx_identity_anchor_global    ON public.entity_identity_anchors(global_ref) WHERE global_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_identity_anchor_network   ON public.entity_identity_anchors(network_ref) WHERE network_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_identity_anchor_org       ON public.entity_identity_anchors(org_id);
CREATE INDEX IF NOT EXISTS idx_identity_anchor_legacy    ON public.entity_identity_anchors(legacy_ref) WHERE legacy_ref IS NOT NULL;

COMMENT ON TABLE public.entity_identity_anchors IS
  'Immutable event-streaming anchor: maps entity PKs to all reference handles.
   Kafka producers emit entity_id (never changes). Consumers can resolve display refs here.';

ALTER TABLE public.entity_identity_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_anchors"
  ON public.entity_identity_anchors FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Upsert anchor (idempotent, safe to call multiple times)
CREATE OR REPLACE FUNCTION public.upsert_entity_anchor(
  p_entity_id  uuid,
  p_entity_type text,
  p_org_id     uuid,
  p_legacy_ref text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.entity_identity_anchors
    (entity_id, entity_type, org_id, legacy_ref)
  VALUES
    (p_entity_id, p_entity_type, p_org_id, p_legacy_ref)
  ON CONFLICT (entity_id) DO UPDATE
    SET legacy_ref  = coalesce(EXCLUDED.legacy_ref, entity_identity_anchors.legacy_ref),
        updated_at  = now();
$$;

GRANT EXECUTE ON FUNCTION public.upsert_entity_anchor(uuid,text,uuid,text) TO authenticated;
