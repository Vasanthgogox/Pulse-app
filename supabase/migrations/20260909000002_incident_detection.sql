-- Incident Detection Engine
-- Deterministic rules for detecting and classifying incidents.
-- Triggered when log events are inserted into log_events table.

-- ── Severity Classifier ────────────────────────────────────────────────────────
-- Determines incident severity based on error characteristics
CREATE OR REPLACE FUNCTION ops.classify_severity(
  p_level text,
  p_error_type text,
  p_message text,
  p_status_code int
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  -- CRITICAL: application-wide outage, database down, auth broken
  IF p_level = 'error' AND (
    p_message ILIKE '%connection timeout%' OR
    p_message ILIKE '%connection refused%' OR
    p_message ILIKE '%database unavailable%' OR
    p_message ILIKE '%pool exhausted%' OR
    p_message ILIKE '%authentication%failed%' OR
    p_status_code IN (502, 503)
  ) THEN
    RETURN 'CRITICAL';
  END IF;

  -- HIGH: major feature down, 5xx spike, significant errors
  IF p_level = 'error' AND (
    p_status_code >= 500 OR
    p_message ILIKE '%failed%' OR
    p_message ILIKE '%error%'
  ) THEN
    RETURN 'HIGH';
  END IF;

  -- MEDIUM: warnings, timeouts, recoverable issues
  IF p_level = 'warn' OR (
    p_level = 'error' AND (
      p_message ILIKE '%timeout%' OR
      p_message ILIKE '%retry%'
    )
  ) THEN
    RETURN 'MEDIUM';
  END IF;

  -- LOW: debug, info, isolated issues
  RETURN 'LOW';
END;
$$;

-- ── Spike Detection ────────────────────────────────────────────────────────────
-- Returns true if error count for fingerprint spiked in last 2 minutes
CREATE OR REPLACE FUNCTION ops.detect_error_spike(
  p_fingerprint text,
  p_threshold int DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM ops.log_events
  WHERE fingerprint = p_fingerprint
    AND level = 'error'
    AND captured_at > now() - interval '2 minutes';

  RETURN v_count >= p_threshold;
END;
$$;

REVOKE ALL ON FUNCTION ops.detect_error_spike(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.detect_error_spike(text, int) TO service_role;

-- ── Incident Creator Trigger ────────────────────────────────────────────────────
-- Called when new log_events are inserted
CREATE OR REPLACE FUNCTION ops.on_log_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_incident_id uuid;
  v_severity text;
  v_title text;
BEGIN
  -- Only process errors and warnings
  IF NEW.level NOT IN ('error', 'warn') THEN
    RETURN NEW;
  END IF;

  -- Compute fingerprint
  NEW.fingerprint := ops.compute_fingerprint(NEW.message, NEW.error_type);

  IF NEW.fingerprint IS NULL THEN
    RETURN NEW;
  END IF;

  -- Classify severity
  v_severity := ops.classify_severity(NEW.level, NEW.error_type, NEW.message, NEW.status_code);

  -- Create short title from message
  v_title := COALESCE(
    NULLIF(LEFT(NEW.error_type || ': ' || NEW.message, 100), ''),
    'Unknown error'
  );

  -- Find or create incident
  v_incident_id := ops.find_or_create_incident(
    NEW.fingerprint,
    COALESCE(NEW.service, 'unknown'),
    COALESCE(NEW.environment, 'production'),
    v_title,
    v_severity
  );

  -- Link event to incident
  INSERT INTO ops.incident_events (incident_id, log_event_id)
  VALUES (v_incident_id, NEW.id)
  ON CONFLICT DO NOTHING;

  -- Update incident frequency
  PERFORM ops.update_incident_frequency(v_incident_id, NEW.route);

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_log_event_insert ON ops.log_events;

-- Create trigger
CREATE TRIGGER trg_log_event_insert
AFTER INSERT ON ops.log_events
FOR EACH ROW
EXECUTE FUNCTION ops.on_log_event_insert();

-- ── Incident Auto-Resolution ──────────────────────────────────────────────────
-- Resolve incidents that have had no activity for N hours
CREATE OR REPLACE FUNCTION ops.auto_resolve_stale_incidents(p_hours int DEFAULT 6)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE ops.incidents
  SET
    status = 'RESOLVED',
    updated_at = now()
  WHERE status IN ('OPEN', 'INVESTIGATING')
    AND last_seen < now() - (p_hours || ' hours')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION ops.auto_resolve_stale_incidents(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.auto_resolve_stale_incidents(int) TO service_role;

-- ── Incident Severity Bump (for investigation triggering) ────────────────────
-- If incident accumulates >N events in <M minutes, raise severity
CREATE OR REPLACE FUNCTION ops.check_incident_for_escalation(p_incident_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_event_count int;
  v_minutes_window int := 5;
  v_threshold int := 10;
BEGIN
  SELECT event_count INTO v_event_count
  FROM ops.incidents
  WHERE id = p_incident_id;

  IF v_event_count > v_threshold THEN
    UPDATE ops.incidents
    SET
      severity = CASE
        WHEN severity = 'LOW' THEN 'MEDIUM'
        WHEN severity = 'MEDIUM' THEN 'HIGH'
        WHEN severity IN ('HIGH', 'CRITICAL') THEN severity
        ELSE 'HIGH'
      END,
      updated_at = now()
    WHERE id = p_incident_id
      AND severity != 'CRITICAL';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ops.check_incident_for_escalation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.check_incident_for_escalation(uuid) TO service_role;
