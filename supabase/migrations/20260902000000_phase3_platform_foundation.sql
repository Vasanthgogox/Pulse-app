-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: Identity Chaos Engineering, Search & Event Platform Hardening
--
-- P1  Idempotency layer (exactly-once creation, retry safety)
-- P2  Event store + outbox pattern (Kafka-ready, AI-agent compatible)
-- P3  Search index abstraction (reference lookup, 100M+ ready)
-- P4  Activity stream (logistics social graph)
-- P5  Observability tables (identity health, event health, search health)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── P2: Production-Grade Idempotency Layer ───────────────────────────────────
--
-- Guarantees: same idempotency_key sent N times → exactly 1 record created.
-- Covers: trip creation, indent creation, invoice, booking, settlement.
-- Recovery: if the original request was interrupted, replays the result.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key              text        PRIMARY KEY,            -- client-supplied idempotency key
  entity_type      text        NOT NULL,               -- 'trip', 'indent', 'invoice', …
  entity_id        uuid,                               -- created entity PK (NULL while in-flight)
  org_id           uuid        NOT NULL,
  user_id          uuid,
  request_hash     text        NOT NULL,               -- SHA-256 of the request body (detect body mismatch)
  response_payload jsonb,                              -- stored response for replay
  status           text        NOT NULL DEFAULT 'pending',  -- pending | completed | failed
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT ik_status_check CHECK (status IN ('pending', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ik_org_type   ON public.idempotency_keys(org_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_ik_entity     ON public.idempotency_keys(entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ik_expires    ON public.idempotency_keys(expires_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_own_idempotency_keys"
  ON public.idempotency_keys FOR ALL
  USING (
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- RPC: acquire an idempotency slot (called BEFORE the insert)
CREATE OR REPLACE FUNCTION public.idempotency_acquire(
  p_key         text,
  p_entity_type text,
  p_org_id      uuid,
  p_user_id     uuid,
  p_req_hash    text
)
RETURNS jsonb   -- { status, entity_id, response_payload, conflict }
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.idempotency_keys%ROWTYPE;
BEGIN
  -- Try to read existing record
  SELECT * INTO v_row FROM public.idempotency_keys WHERE key = p_key;

  IF FOUND THEN
    -- Key exists — check for body mismatch (different request for same key)
    IF v_row.request_hash <> p_req_hash THEN
      RETURN jsonb_build_object(
        'status', 'conflict',
        'error', 'Idempotency key reused with different request body'
      );
    END IF;

    -- Already completed: return stored result
    IF v_row.status = 'completed' THEN
      RETURN jsonb_build_object(
        'status', 'completed',
        'entity_id', v_row.entity_id,
        'response_payload', v_row.response_payload,
        'replayed', true
      );
    END IF;

    -- Pending: still in-flight (or crashed mid-way)
    IF v_row.status = 'pending' AND v_row.created_at > now() - interval '30 seconds' THEN
      RETURN jsonb_build_object(
        'status', 'pending',
        'error', 'Request is still processing. Retry after 30 seconds.'
      );
    END IF;

    -- Failed or stale pending: allow retry
    UPDATE public.idempotency_keys
    SET status = 'pending', error_message = NULL,
        request_hash = p_req_hash, created_at = now(),
        expires_at = now() + interval '24 hours'
    WHERE key = p_key;

    RETURN jsonb_build_object('status', 'retry_allowed');
  END IF;

  -- New key: insert and claim the slot
  INSERT INTO public.idempotency_keys (key, entity_type, org_id, user_id, request_hash)
  VALUES (p_key, p_entity_type, p_org_id, p_user_id, p_req_hash)
  ON CONFLICT (key) DO NOTHING;

  RETURN jsonb_build_object('status', 'acquired');
END;
$$;

-- RPC: complete an idempotency slot (called AFTER successful insert)
CREATE OR REPLACE FUNCTION public.idempotency_complete(
  p_key         text,
  p_entity_id   uuid,
  p_response    jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.idempotency_keys
  SET status           = 'completed',
      entity_id        = p_entity_id,
      response_payload = p_response,
      completed_at     = now()
  WHERE key = p_key;
$$;

-- RPC: mark a slot as failed
CREATE OR REPLACE FUNCTION public.idempotency_fail(
  p_key   text,
  p_error text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.idempotency_keys
  SET status = 'failed', error_message = p_error
  WHERE key = p_key;
$$;

GRANT EXECUTE ON FUNCTION public.idempotency_acquire(text,text,uuid,uuid,text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.idempotency_complete(text,uuid,jsonb)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.idempotency_fail(text,text)                    TO authenticated;

COMMENT ON TABLE public.idempotency_keys IS
  'Exactly-once creation guarantee. Same key submitted N times → 1 record. 24h TTL.';

-- Auto-cleanup expired keys
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM public.idempotency_keys
    WHERE expires_at < now() - interval '1 hour'
    RETURNING 1
  )
  SELECT count(*)::integer FROM deleted;
$$;

-- ── P3: Event Store + Outbox Pattern ─────────────────────────────────────────
--
-- event_store: append-only log of all entity changes (event sourcing)
-- event_outbox: reliable delivery to Kafka/webhooks (transactional outbox)
-- event_dead_letter: failed/unprocessable events
--
-- Invariants:
--   • Every event has a UUIDv7 id (time-sortable, event stream friendly)
--   • Entity relationships use UUIDs ONLY (never business references)
--   • Events are immutable once written
--   • Causation chain: caused_by_event_id links events

CREATE TABLE IF NOT EXISTS public.event_store (
  id              uuid        PRIMARY KEY DEFAULT public.uuidv7_generate(),
  event_type      text        NOT NULL,   -- TripCreated, DriverAssigned, LoadShared…
  aggregate_type  text        NOT NULL,   -- trip, indent, driver, fleet…
  aggregate_id    uuid        NOT NULL,   -- entity UUID (immutable PK)
  org_id          uuid,                   -- owning org (NULL for global events)
  user_id         uuid,                   -- human actor (NULL for AI/system)
  agent_id        text,                   -- AI agent identifier if applicable
  payload         jsonb       NOT NULL DEFAULT '{}',
  metadata        jsonb       NOT NULL DEFAULT '{}',
  version         bigint      NOT NULL DEFAULT 1,  -- aggregate version (for optimistic concurrency)
  caused_by       uuid,                   -- parent event id (causation chain)
  correlation_id  uuid,                   -- groups related events (e.g. saga)
  schema_version  text        NOT NULL DEFAULT '1.0',
  emitted_at      timestamptz NOT NULL DEFAULT now(),
  -- Partitioned index-friendly: aggregate_id + emitted_at for projection queries
  CONSTRAINT event_store_positive_version CHECK (version > 0)
);

-- Partitioned by emitted_at month for 100M+ scale (add partitioning in Phase 4)
CREATE INDEX IF NOT EXISTS idx_event_store_agg         ON public.event_store(aggregate_id, emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_store_type_ts     ON public.event_store(event_type, emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_store_org_ts      ON public.event_store(org_id, emitted_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_store_correlation ON public.event_store(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_store_causation   ON public.event_store(caused_by) WHERE caused_by IS NOT NULL;

-- event_store is append-only: no UPDATE or DELETE (RLS enforces this)
ALTER TABLE public.event_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_events"
  ON public.event_store FOR SELECT
  USING (
    org_id IS NULL OR
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "system_inserts_events"
  ON public.event_store FOR INSERT
  WITH CHECK (true);  -- insert controlled by SECURITY DEFINER RPCs

-- Outbox: reliable delivery to downstream consumers (Kafka, webhooks, push)
CREATE TABLE IF NOT EXISTS public.event_outbox (
  id              uuid        PRIMARY KEY DEFAULT public.uuidv7_generate(),
  event_id        uuid        NOT NULL REFERENCES public.event_store(id),
  destination     text        NOT NULL,   -- 'kafka', 'webhook', 'push', 'email'
  topic           text,                   -- Kafka topic or webhook URL
  payload         jsonb       NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',  -- pending|processing|delivered|failed
  attempt_count   smallint    NOT NULL DEFAULT 0,
  max_attempts    smallint    NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  delivered_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_status_check CHECK (status IN ('pending','processing','delivered','failed','dead'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_next ON public.event_outbox(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_outbox_event_id    ON public.event_outbox(event_id);

ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_manages_outbox" ON public.event_outbox FOR ALL USING (auth.role() = 'service_role');

-- Dead letter queue: events that exhausted all retry attempts
CREATE TABLE IF NOT EXISTS public.event_dead_letter (
  id              uuid        PRIMARY KEY DEFAULT public.uuidv7_generate(),
  original_id     uuid        NOT NULL,   -- original outbox record id
  event_id        uuid        NOT NULL,
  destination     text        NOT NULL,
  payload         jsonb       NOT NULL,
  failure_reason  text        NOT NULL,
  attempt_count   smallint    NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolution_note text
);

CREATE INDEX IF NOT EXISTS idx_dlq_event_id ON public.event_dead_letter(event_id);
ALTER TABLE public.event_dead_letter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_manages_dlq" ON public.event_dead_letter FOR ALL USING (auth.role() = 'service_role');

-- Core event emission function (called inside every entity-mutating transaction)
CREATE OR REPLACE FUNCTION public.emit_event(
  p_event_type     text,
  p_aggregate_type text,
  p_aggregate_id   uuid,
  p_payload        jsonb,
  p_org_id         uuid   DEFAULT NULL,
  p_user_id        uuid   DEFAULT NULL,
  p_caused_by      uuid   DEFAULT NULL,
  p_correlation_id uuid   DEFAULT NULL,
  p_metadata       jsonb  DEFAULT '{}'
)
RETURNS uuid   -- event_id
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id  uuid;
  v_version   bigint;
BEGIN
  -- Optimistic versioning: next version = count of existing events for this aggregate
  SELECT coalesce(max(version), 0) + 1
  INTO v_version
  FROM public.event_store
  WHERE aggregate_id = p_aggregate_id;

  INSERT INTO public.event_store
    (event_type, aggregate_type, aggregate_id, org_id, user_id,
     payload, metadata, version, caused_by, correlation_id)
  VALUES
    (p_event_type, p_aggregate_type, p_aggregate_id, p_org_id, p_user_id,
     p_payload, p_metadata, v_version, p_caused_by, p_correlation_id)
  RETURNING id INTO v_event_id;

  -- Queue for outbox delivery (Kafka-first; webhook secondary)
  INSERT INTO public.event_outbox (event_id, destination, topic, payload)
  VALUES
    (v_event_id, 'kafka',
     'pulse.events.' || p_aggregate_type,
     jsonb_build_object(
       'id',             v_event_id,
       'type',           p_event_type,
       'aggregate_type', p_aggregate_type,
       'aggregate_id',   p_aggregate_id,
       'version',        v_version,
       'payload',        p_payload,
       'emitted_at',     now(),
       'correlation_id', p_correlation_id
     )
    );

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emit_event(text,text,uuid,jsonb,uuid,uuid,uuid,uuid,jsonb) TO authenticated;

-- Known event types (for schema validation and documentation)
CREATE TABLE IF NOT EXISTS public.event_schema_registry (
  event_type      text    PRIMARY KEY,
  aggregate_type  text    NOT NULL,
  schema_version  text    NOT NULL DEFAULT '1.0',
  description     text,
  payload_schema  jsonb,  -- JSON Schema for payload validation (future)
  created_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.event_schema_registry (event_type, aggregate_type, description) VALUES
  ('TripCreated',        'trip',    'A new trip was created'),
  ('TripUpdated',        'trip',    'Trip fields were updated'),
  ('TripAssigned',       'trip',    'Driver and/or vehicle assigned to trip'),
  ('TripStarted',        'trip',    'Driver confirmed trip start'),
  ('TripCompleted',      'trip',    'Trip was completed and POD collected'),
  ('TripCancelled',      'trip',    'Trip was cancelled'),
  ('IndentCreated',      'indent',  'A new load indent was posted'),
  ('IndentAwarded',      'indent',  'Indent awarded to a fleet owner'),
  ('IndentCancelled',    'indent',  'Indent was cancelled'),
  ('DriverAssigned',     'trip',    'Driver was assigned to a trip'),
  ('DriverReassigned',   'trip',    'Driver was reassigned on a trip'),
  ('LoadShared',         'trip',    'Trip shared with a partner organization'),
  ('InvoiceCreated',     'invoice', 'Invoice generated for a trip'),
  ('InvoiceApproved',    'invoice', 'Invoice approved by the client'),
  ('PaymentReceived',    'invoice', 'Payment received against invoice'),
  ('BookingCreated',     'booking', 'Cross-org booking reference created'),
  ('BookingAccepted',    'booking', 'Booking accepted by supplier'),
  ('OrganizationJoined', 'org',     'New organization joined the network')
ON CONFLICT (event_type) DO NOTHING;

-- ── P4: Search Architecture ───────────────────────────────────────────────────
--
-- Abstraction layer for global search: UUIDs, refs, vehicle numbers, names.
-- Currently backed by Postgres full-text; migrates to Elasticsearch transparently.

CREATE TABLE IF NOT EXISTS public.search_index (
  id              uuid        PRIMARY KEY DEFAULT public.uuidv7_generate(),
  entity_type     text        NOT NULL,
  entity_id       uuid        NOT NULL UNIQUE,
  org_id          uuid,
  -- Searchable fields (denormalized for single-table scan)
  display_name    text,
  reference       text,                   -- TRP-26-AB4K7F
  secondary_ref   text,                   -- TRP001 legacy
  network_ref     text,                   -- BKG-H8K2P7
  vehicle_number  text,
  phone           text,
  location_text   text,                   -- "Delhi, NCR → Mumbai, Maharashtra"
  tags            text[],                 -- searchable labels
  -- Postgres full-text search vector
  search_vector   tsvector GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(display_name, '') || ' ' ||
      coalesce(reference, '')    || ' ' ||
      coalesce(secondary_ref, '') || ' ' ||
      coalesce(vehicle_number, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(location_text, '')
    )
  ) STORED,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Score for result ranking
  relevance_boost float4      NOT NULL DEFAULT 1.0
);

CREATE INDEX IF NOT EXISTS idx_search_type_org    ON public.search_index(entity_type, org_id);
CREATE INDEX IF NOT EXISTS idx_search_ref         ON public.search_index(reference)    WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_secondary   ON public.search_index(secondary_ref) WHERE secondary_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_vehicle     ON public.search_index(vehicle_number) WHERE vehicle_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_fts         ON public.search_index USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_search_tags        ON public.search_index USING GIN(tags);

ALTER TABLE public.search_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_search"
  ON public.search_index FOR SELECT
  USING (
    org_id IS NULL OR
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Global search RPC — single entry point for all search types
CREATE OR REPLACE FUNCTION public.global_search(
  p_query   text,
  p_org_id  uuid  DEFAULT NULL,
  p_types   text[] DEFAULT NULL,
  p_limit   int   DEFAULT 20,
  p_offset  int   DEFAULT 0
)
RETURNS TABLE (
  entity_type  text,
  entity_id    uuid,
  display_name text,
  reference    text,
  secondary_ref text,
  network_ref  text,
  org_id       uuid,
  rank         float4
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.entity_type,
    s.entity_id,
    s.display_name,
    s.reference,
    s.secondary_ref,
    s.network_ref,
    s.org_id,
    (ts_rank(s.search_vector, query) * s.relevance_boost)::float4 AS rank
  FROM public.search_index s,
       to_tsquery('english', regexp_replace(trim(p_query), '\s+', ':* & ', 'g') || ':*') AS query
  WHERE
    (p_org_id IS NULL OR s.org_id = p_org_id OR s.org_id IS NULL) AND
    (p_types IS NULL OR s.entity_type = ANY(p_types)) AND
    (
      s.search_vector @@ query OR
      s.reference     ILIKE '%' || p_query || '%' OR
      s.secondary_ref ILIKE '%' || p_query || '%' OR
      s.vehicle_number ILIKE '%' || p_query || '%'
    )
  ORDER BY rank DESC, s.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- Fast reference lookup (UUID from any reference format)
CREATE OR REPLACE FUNCTION public.lookup_by_reference(p_ref text)
RETURNS TABLE (entity_type text, entity_id uuid, org_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.entity_type, s.entity_id, s.org_id
  FROM public.search_index s
  WHERE
    s.reference     = p_ref OR
    s.secondary_ref = p_ref OR
    s.network_ref   = p_ref OR
    s.entity_id     = (CASE WHEN p_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                            THEN p_ref::uuid ELSE NULL END)
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.global_search(text,uuid,text[],int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_by_reference(text)               TO authenticated;

-- ── P5: Activity Stream ───────────────────────────────────────────────────────
--
-- Logistics social graph: broker created trip, driver updated status, etc.
-- References use immutable UUIDs only — survives reference changes.

CREATE TABLE IF NOT EXISTS public.activity_stream (
  id              uuid        PRIMARY KEY DEFAULT public.uuidv7_generate(),
  activity_type   text        NOT NULL,   -- 'trip.created', 'load.shared', 'driver.assigned'
  -- Actor (who did it)
  actor_type      text        NOT NULL,   -- 'user', 'ai_agent', 'system', 'organization'
  actor_id        uuid        NOT NULL,   -- user_id, org_id, or agent UUID
  actor_name      text,
  -- Target (what was acted on)
  target_type     text        NOT NULL,   -- 'trip', 'indent', 'driver', 'fleet'
  target_id       uuid        NOT NULL,   -- entity UUID (immutable)
  target_ref      text,                   -- display ref for quick rendering (mutable)
  target_name     text,
  -- Context
  org_id          uuid,
  context_payload jsonb       NOT NULL DEFAULT '{}',
  is_public       boolean     NOT NULL DEFAULT false,  -- visible on public logistics feed
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_org_ts     ON public.activity_stream(org_id, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_actor      ON public.activity_stream(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_target     ON public.activity_stream(target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type_ts    ON public.activity_stream(activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_public_ts  ON public.activity_stream(created_at DESC) WHERE is_public;

ALTER TABLE public.activity_stream ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_feed"
  ON public.activity_stream FOR SELECT
  USING (
    is_public OR
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    ) OR
    actor_id = auth.uid()
  );

-- Record an activity (called from triggers or application layer)
CREATE OR REPLACE FUNCTION public.record_activity(
  p_activity_type text,
  p_actor_type    text,
  p_actor_id      uuid,
  p_actor_name    text,
  p_target_type   text,
  p_target_id     uuid,
  p_target_ref    text  DEFAULT NULL,
  p_target_name   text  DEFAULT NULL,
  p_org_id        uuid  DEFAULT NULL,
  p_context       jsonb DEFAULT '{}',
  p_is_public     boolean DEFAULT false
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.activity_stream
    (activity_type, actor_type, actor_id, actor_name,
     target_type, target_id, target_ref, target_name,
     org_id, context_payload, is_public)
  VALUES
    (p_activity_type, p_actor_type, p_actor_id, p_actor_name,
     p_target_type, p_target_id, p_target_ref, p_target_name,
     p_org_id, p_context, p_is_public)
  RETURNING id;
$$;

GRANT EXECUTE ON FUNCTION public.record_activity(text,text,uuid,text,text,uuid,text,text,uuid,jsonb,boolean) TO authenticated;

-- ── P6: Observability & Operational Intelligence ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_metrics (
  id          uuid        PRIMARY KEY DEFAULT public.uuidv7_generate(),
  metric_name text        NOT NULL,
  metric_value numeric     NOT NULL,
  labels      jsonb       NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metrics_name_ts ON public.platform_metrics(metric_name, recorded_at DESC);

-- Operational health dashboard: aggregates key metrics in one call
CREATE OR REPLACE FUNCTION public.get_platform_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'identity', (SELECT public.get_identity_health(now() - interval '1 hour')),
    'events', jsonb_build_object(
      'total_24h',        (SELECT count(*) FROM public.event_store WHERE emitted_at > now() - interval '24 hours'),
      'outbox_pending',   (SELECT count(*) FROM public.event_outbox WHERE status = 'pending'),
      'outbox_failed',    (SELECT count(*) FROM public.event_outbox WHERE status = 'failed'),
      'dead_letter_24h',  (SELECT count(*) FROM public.event_dead_letter WHERE created_at > now() - interval '24 hours')
    ),
    'idempotency', jsonb_build_object(
      'pending_keys',     (SELECT count(*) FROM public.idempotency_keys WHERE status = 'pending'),
      'completed_24h',    (SELECT count(*) FROM public.idempotency_keys WHERE status = 'completed' AND completed_at > now() - interval '24 hours'),
      'failed_24h',       (SELECT count(*) FROM public.idempotency_keys WHERE status = 'failed' AND created_at > now() - interval '24 hours')
    ),
    'search', jsonb_build_object(
      'indexed_entities', (SELECT count(*) FROM public.search_index),
      'by_type',          (SELECT jsonb_object_agg(entity_type, cnt) FROM (
                             SELECT entity_type, count(*) AS cnt FROM public.search_index GROUP BY entity_type
                           ) t)
    ),
    'activity', jsonb_build_object(
      'events_24h',       (SELECT count(*) FROM public.activity_stream WHERE created_at > now() - interval '24 hours'),
      'public_events_24h',(SELECT count(*) FROM public.activity_stream WHERE is_public AND created_at > now() - interval '24 hours')
    ),
    'generated_at', now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_health() TO authenticated;

-- ── Disaster Recovery: integrity check function ───────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_identity_integrity(
  p_since timestamptz DEFAULT now() - interval '24 hours'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'period_start',         p_since,
    'orphan_events',        (
      SELECT count(*) FROM public.event_store e
      WHERE e.emitted_at >= p_since
        AND NOT EXISTS (
          SELECT 1 FROM public.idempotency_keys ik
          WHERE ik.entity_id = e.aggregate_id
        )
    ),
    'duplicate_refs',       (
      SELECT count(*) FROM (
        SELECT reference, count(*) AS cnt
        FROM public.global_references
        WHERE issued_at >= p_since
        GROUP BY reference
        HAVING count(*) > 1
      ) dups
    ),
    'stale_pending_keys',   (
      SELECT count(*) FROM public.idempotency_keys
      WHERE status = 'pending'
        AND created_at < now() - interval '5 minutes'
    ),
    'search_lag',           (
      SELECT count(*) FROM public.event_store e
      WHERE e.emitted_at >= p_since
        AND NOT EXISTS (
          SELECT 1 FROM public.search_index s WHERE s.entity_id = e.aggregate_id
        )
        AND e.aggregate_type IN ('trip', 'indent', 'driver', 'vehicle')
    ),
    'all_clear',            (
      SELECT
        (SELECT count(*) FROM public.global_references r1
         JOIN public.global_references r2 ON r1.reference = r2.reference AND r1.id <> r2.id) = 0
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.validate_identity_integrity(timestamptz) TO authenticated;
