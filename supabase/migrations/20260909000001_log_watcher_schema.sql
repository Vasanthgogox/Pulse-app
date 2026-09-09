-- Log Watcher Agent schema
-- Captures application logs, detects incidents, stores AI investigation results.
-- All tables follow IF NOT EXISTS pattern for safe re-runs.

-- ── Log Events Table ──────────────────────────────────────────────────────────
-- Normalized log events from application sources
CREATE TABLE IF NOT EXISTS ops.log_events (
  id                   bigserial PRIMARY KEY,

  -- Core metadata
  captured_at          timestamptz NOT NULL DEFAULT now(),
  service              text,              -- 'api', 'function-check-user-by-phone', etc.
  environment          text DEFAULT 'production',

  -- Log level
  level                text NOT NULL,     -- 'debug', 'info', 'warn', 'error'

  -- Message & error
  message              text,              -- Log message
  error_type           text,              -- Error class name (e.g., 'DatabaseError')
  stack_trace          text,              -- Stack trace (truncated)

  -- Request context (when available)
  request_id           text,              -- Correlation ID
  user_id_hash         text,              -- Hashed user ID (no PII)
  route                text,              -- API endpoint
  method               text,              -- HTTP method
  status_code          int,               -- HTTP status

  -- Performance
  latency_ms           numeric,           -- Request duration

  -- Additional metadata
  metadata             jsonb,             -- Additional context (sanitized)
  source               text,              -- 'browser', 'function', 'cron'

  -- Fingerprint for grouping
  fingerprint          text               -- Error fingerprint (computed)
);

CREATE INDEX IF NOT EXISTS idx_log_events_captured_at
  ON ops.log_events(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_events_fingerprint
  ON ops.log_events(fingerprint, service, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_events_level
  ON ops.log_events(level, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_events_service
  ON ops.log_events(service, captured_at DESC);

-- Retention: keep 30 days
CREATE OR REPLACE FUNCTION ops.trim_log_events()
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  DELETE FROM ops.log_events
  WHERE captured_at < now() - interval '30 days';
END;
$$;

-- ── Incidents Table ────────────────────────────────────────────────────────────
-- Grouped log events representing distinct problems
CREATE TABLE IF NOT EXISTS ops.incidents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lifecycle
  status               text NOT NULL DEFAULT 'OPEN',  -- OPEN, INVESTIGATING, DIAGNOSED, RESOLVED, IGNORED
  severity             text NOT NULL DEFAULT 'MEDIUM', -- CRITICAL, HIGH, MEDIUM, LOW

  -- Identification
  service              text,
  environment          text DEFAULT 'production',
  title                text,              -- Human-readable summary
  fingerprint          text,              -- Stable identifier for grouping

  -- Frequency
  first_seen           timestamptz NOT NULL DEFAULT now(),
  last_seen            timestamptz NOT NULL DEFAULT now(),
  event_count          int NOT NULL DEFAULT 1,

  -- Context
  affected_routes      text[],            -- Array of affected endpoints
  affected_users_count int,               -- Approximate unique users

  -- Investigation
  investigation_status text DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETE, FAILED
  investigation_id     uuid,
  diagnosis            text,              -- AI diagnosis
  confidence           numeric,           -- 0.0 - 1.0

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status
  ON ops.incidents(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_fingerprint
  ON ops.incidents(fingerprint, service, environment);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at
  ON ops.incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_investigation_id
  ON ops.incidents(investigation_id);

-- Retention: keep 90 days
CREATE OR REPLACE FUNCTION ops.trim_incidents()
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  DELETE FROM ops.incidents
  WHERE status = 'RESOLVED'
    AND updated_at < now() - interval '90 days';
END;
$$;

-- ── Incident Events Join Table ────────────────────────────────────────────────
-- Links log_events to incidents for quick lookup
CREATE TABLE IF NOT EXISTS ops.incident_events (
  incident_id          uuid NOT NULL,
  log_event_id         bigint NOT NULL,

  PRIMARY KEY (incident_id, log_event_id),
  FOREIGN KEY (incident_id) REFERENCES ops.incidents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_incident_events_log_event
  ON ops.incident_events(log_event_id);

-- ── Investigations Table ──────────────────────────────────────────────────────
-- AI investigation results for incidents
CREATE TABLE IF NOT EXISTS ops.investigations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage
  incident_id          uuid NOT NULL UNIQUE,

  -- AI investigation metadata
  status               text NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETE, FAILED
  model                text DEFAULT 'claude-opus-5',
  created_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,

  -- Results (structured)
  summary              text,              -- Brief summary
  likely_root_cause    text,              -- Best hypothesis
  confidence           numeric,           -- 0.0 - 1.0
  evidence             jsonb,             -- Array of evidence strings
  affected_components  text[],            -- Services/components involved
  timeline             jsonb,             -- Temporal correlations
  recommended_actions  text[],            -- What to do
  unknowns             text[],            -- Data gaps

  -- Audit
  investigation_notes  text,              -- Free-form notes
  ai_tokens_used       int,

  FOREIGN KEY (incident_id) REFERENCES ops.incidents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_investigations_incident
  ON ops.investigations(incident_id);
CREATE INDEX IF NOT EXISTS idx_investigations_completed
  ON ops.investigations(completed_at DESC);

-- ── Watcher Checkpoint Table ──────────────────────────────────────────────────
-- Tracks last processed log position for fault recovery
CREATE TABLE IF NOT EXISTS ops.watcher_checkpoint (
  watcher_name         text PRIMARY KEY,
  last_processed_id    bigint,
  last_processed_at    timestamptz,
  last_successful_run  timestamptz DEFAULT now(),

  -- Metrics
  events_processed     bigint DEFAULT 0,
  incidents_created    bigint DEFAULT 0,
  investigations_started bigint DEFAULT 0,
  failures_total       int DEFAULT 0,

  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Incident Deduplication Helper ──────────────────────────────────────────────
-- Find or create incident for a given fingerprint
CREATE OR REPLACE FUNCTION ops.find_or_create_incident(
  p_fingerprint text,
  p_service text,
  p_title text,
  p_environment text DEFAULT 'production',
  p_severity text DEFAULT 'MEDIUM'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_incident_id uuid;
BEGIN
  -- Try to find existing OPEN or INVESTIGATING incident within 10-minute window
  SELECT id INTO v_incident_id
  FROM ops.incidents
  WHERE fingerprint = p_fingerprint
    AND service = p_service
    AND environment = p_environment
    AND status IN ('OPEN', 'INVESTIGATING')
    AND last_seen > now() - interval '10 minutes'
  LIMIT 1;

  IF v_incident_id IS NOT NULL THEN
    RETURN v_incident_id;
  END IF;

  -- Create new incident
  INSERT INTO ops.incidents (
    fingerprint, service, environment, title, severity,
    first_seen, last_seen, event_count
  ) VALUES (
    p_fingerprint, p_service, p_environment, p_title, p_severity,
    now(), now(), 1
  )
  RETURNING id INTO v_incident_id;

  RETURN v_incident_id;
END;
$$;

REVOKE ALL ON FUNCTION ops.find_or_create_incident(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.find_or_create_incident(text, text, text, text, text) TO service_role;

-- ── Update Incident Frequency ──────────────────────────────────────────────────
-- Called when a log event belongs to an existing incident
CREATE OR REPLACE FUNCTION ops.update_incident_frequency(
  p_incident_id uuid,
  p_route text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  UPDATE ops.incidents
  SET
    event_count = event_count + 1,
    last_seen = now(),
    affected_routes = CASE
      WHEN p_route IS NOT NULL THEN array_append(affected_routes, p_route)
      ELSE affected_routes
    END,
    updated_at = now()
  WHERE id = p_incident_id;
END;
$$;

REVOKE ALL ON FUNCTION ops.update_incident_frequency(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.update_incident_frequency(uuid, text) TO service_role;

-- ── Compute Error Fingerprint ──────────────────────────────────────────────────
-- Normalizes error messages by removing dynamic parts (UUIDs, IDs, timestamps, numbers)
CREATE OR REPLACE FUNCTION ops.compute_fingerprint(
  p_message text,
  p_error_type text
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_normalized text;
BEGIN
  IF p_message IS NULL THEN
    RETURN NULL;
  END IF;

  v_normalized := p_message;

  -- Remove UUIDs (standard format)
  v_normalized := regexp_replace(v_normalized, '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', 'UUID', 'gi');

  -- Remove common IDs: 32+ hex chars, numeric IDs
  v_normalized := regexp_replace(v_normalized, '[a-f0-9]{32,}', 'HASH', 'gi');
  v_normalized := regexp_replace(v_normalized, '\b\d{10,}\b', 'ID', 'g');

  -- Remove IP addresses
  v_normalized := regexp_replace(v_normalized, '\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', 'IP', 'g');

  -- Remove timestamps
  v_normalized := regexp_replace(v_normalized, '\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[Z]?', 'TIMESTAMP', 'g');

  -- Combine error type and normalized message
  RETURN coalesce(p_error_type || ':', '') || lower(v_normalized);
END;
$$;

-- ── RPC: Get Incident Summary (for UI/API) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_incidents_summary(
  p_limit int DEFAULT 50,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  status text,
  severity text,
  service text,
  title text,
  event_count int,
  first_seen timestamptz,
  last_seen timestamptz,
  investigation_status text,
  diagnosis text,
  confidence numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.status,
    i.severity,
    i.service,
    i.title,
    i.event_count,
    i.first_seen,
    i.last_seen,
    i.investigation_status,
    i.diagnosis,
    i.confidence
  FROM ops.incidents i
  WHERE (p_status IS NULL OR i.status = p_status)
  ORDER BY i.updated_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_incidents_summary(int, text) TO authenticated;

-- ── RPC: Get Incident Details ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_incident_details(p_incident_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
  v_events jsonb;
  v_investigation jsonb;
BEGIN
  -- Fetch incident
  SELECT jsonb_build_object(
    'id', i.id,
    'status', i.status,
    'severity', i.severity,
    'service', i.service,
    'title', i.title,
    'event_count', i.event_count,
    'first_seen', i.first_seen,
    'last_seen', i.last_seen,
    'affected_routes', i.affected_routes,
    'created_at', i.created_at,
    'updated_at', i.updated_at
  ) INTO v_result
  FROM ops.incidents i
  WHERE i.id = p_incident_id;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch related events (last 20)
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', le.id,
      'captured_at', le.captured_at,
      'level', le.level,
      'message', le.message,
      'error_type', le.error_type,
      'route', le.route,
      'status_code', le.status_code,
      'latency_ms', le.latency_ms
    ) ORDER BY le.captured_at DESC
  ), '[]'::jsonb) INTO v_events
  FROM ops.log_events le
  INNER JOIN ops.incident_events ie ON ie.log_event_id = le.id
  WHERE ie.incident_id = p_incident_id
  LIMIT 20;

  v_result := v_result || jsonb_build_object('events', v_events);

  -- Fetch investigation if present
  SELECT jsonb_build_object(
    'summary', inv.summary,
    'likely_root_cause', inv.likely_root_cause,
    'confidence', inv.confidence,
    'evidence', inv.evidence,
    'affected_components', inv.affected_components,
    'recommended_actions', inv.recommended_actions,
    'unknowns', inv.unknowns
  ) INTO v_investigation
  FROM ops.investigations inv
  WHERE inv.incident_id = p_incident_id;

  IF v_investigation IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('investigation', v_investigation);
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_incident_details(uuid) TO authenticated;

-- ── RPC: Update Incident Status ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_incident_status(
  p_incident_id uuid,
  p_new_status text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  -- Validate status
  IF p_new_status NOT IN ('OPEN', 'INVESTIGATING', 'DIAGNOSED', 'RESOLVED', 'IGNORED') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  -- Update incident
  UPDATE ops.incidents
  SET
    status = p_new_status,
    updated_at = now()
  WHERE id = p_incident_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_incident_status(uuid, text) TO authenticated;

-- ── Grants for watcher functions ──────────────────────────────────────────────
GRANT SELECT, INSERT ON ops.log_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON ops.incidents TO service_role;
GRANT SELECT, INSERT ON ops.incident_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON ops.investigations TO service_role;
GRANT SELECT, INSERT, UPDATE ON ops.watcher_checkpoint TO service_role;
