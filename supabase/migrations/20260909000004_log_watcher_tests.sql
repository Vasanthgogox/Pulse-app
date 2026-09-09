-- Log Watcher Test Suite
-- Comprehensive tests for log collection, fingerprinting, incident detection, and deduplication

-- ── Test Helpers ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.test_reset()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  DELETE FROM ops.incident_events;
  DELETE FROM ops.incidents;
  DELETE FROM ops.log_events;
  DELETE FROM ops.investigations;
  DELETE FROM ops.watcher_checkpoint;
END;
$$;

-- ── Test 1: Log Event Normalization ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.test_log_normalization()
RETURNS TABLE (test_name text, passed boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_event_id bigint;
  v_event_count int;
BEGIN
  PERFORM ops.test_reset();

  -- Insert a test log event
  INSERT INTO ops.log_events (service, level, message, error_type, source)
  VALUES ('test-service', 'error', 'Database connection failed', 'ConnectionError', 'function')
  RETURNING id INTO v_event_id;

  -- Verify it was inserted
  SELECT count(*) INTO v_event_count FROM ops.log_events WHERE id = v_event_id;

  RETURN QUERY SELECT
    'test_log_normalization'::text,
    v_event_count = 1,
    'Log event inserted and retrievable'::text;
END;
$$;

-- ── Test 2: Fingerprinting ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.test_fingerprinting()
RETURNS TABLE (test_name text, passed boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_fp1 text;
  v_fp2 text;
  v_fp3 text;
BEGIN
  -- Same message, same fingerprint
  v_fp1 := ops.compute_fingerprint('Database timeout error', 'DatabaseError');
  v_fp2 := ops.compute_fingerprint('Database timeout error', 'DatabaseError');

  RETURN QUERY SELECT
    'test_fingerprinting_same'::text,
    v_fp1 = v_fp2,
    'Same error produces same fingerprint'::text;

  -- Different messages with dynamic parts should normalize
  v_fp1 := ops.compute_fingerprint('Failed to load user 550e8400-e29b-41d4-a716-446655440000', 'UserError');
  v_fp2 := ops.compute_fingerprint('Failed to load user 6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'UserError');

  RETURN QUERY SELECT
    'test_fingerprinting_normalization'::text,
    v_fp1 = v_fp2,
    'UUIDs in messages are normalized'::text;

  -- Different error types produce different fingerprints
  v_fp1 := ops.compute_fingerprint('Connection error', 'NetworkError');
  v_fp2 := ops.compute_fingerprint('Connection error', 'DatabaseError');

  RETURN QUERY SELECT
    'test_fingerprinting_type'::text,
    v_fp1 != v_fp2,
    'Different error types produce different fingerprints'::text;
END;
$$;

-- ── Test 3: Incident Creation and Deduplication ────────────────────────────────

CREATE OR REPLACE FUNCTION ops.test_incident_deduplication()
RETURNS TABLE (test_name text, passed boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_incident_id1 uuid;
  v_incident_id2 uuid;
  v_incident_id3 uuid;
  v_incident_count int;
BEGIN
  PERFORM ops.test_reset();

  -- Create first incident
  v_incident_id1 := ops.find_or_create_incident(
    'db_timeout_error',
    'api',
    'production',
    'Database timeout',
    'HIGH'
  );

  -- Same fingerprint within 10 minutes should return same incident
  v_incident_id2 := ops.find_or_create_incident(
    'db_timeout_error',
    'api',
    'production',
    'Database timeout',
    'HIGH'
  );

  RETURN QUERY SELECT
    'test_incident_deduplication'::text,
    v_incident_id1 = v_incident_id2,
    'Same fingerprint within window returns same incident'::text;

  -- Different service should create new incident
  v_incident_id3 := ops.find_or_create_incident(
    'db_timeout_error',
    'webhook',
    'production',
    'Database timeout',
    'HIGH'
  );

  RETURN QUERY SELECT
    'test_incident_service_separation'::text,
    v_incident_id1 != v_incident_id3,
    'Different service creates separate incident'::text;

  -- Verify we have exactly 2 incidents
  SELECT count(*) INTO v_incident_count FROM ops.incidents;

  RETURN QUERY SELECT
    'test_incident_count'::text,
    v_incident_count = 2,
    'Exactly 2 incidents created'::text;
END;
$$;

-- ── Test 4: Severity Classification ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.test_severity_classification()
RETURNS TABLE (test_name text, passed boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_sev_critical text;
  v_sev_high text;
  v_sev_medium text;
  v_sev_low text;
BEGIN
  v_sev_critical := ops.classify_severity('error', 'DatabaseError', 'database unavailable', 503);
  RETURN QUERY SELECT
    'test_severity_critical'::text,
    v_sev_critical = 'CRITICAL',
    'Database unavailable marked CRITICAL'::text;

  v_sev_high := ops.classify_severity('error', 'APIError', 'request failed', 500);
  RETURN QUERY SELECT
    'test_severity_high'::text,
    v_sev_high = 'HIGH',
    '500 error marked HIGH'::text;

  v_sev_medium := ops.classify_severity('warn', NULL, 'request timeout', NULL);
  RETURN QUERY SELECT
    'test_severity_medium'::text,
    v_sev_medium = 'MEDIUM',
    'Warning marked MEDIUM'::text;

  v_sev_low := ops.classify_severity('info', NULL, 'application started', NULL);
  RETURN QUERY SELECT
    'test_severity_low'::text,
    v_sev_low = 'LOW',
    'Info marked LOW'::text;
END;
$$;

-- ── Test 5: Trigger-based Incident Creation ──────────────────────────────────

CREATE OR REPLACE FUNCTION ops.test_trigger_incident_creation()
RETURNS TABLE (test_name text, passed boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_incident_count int;
  v_event_count int;
BEGIN
  PERFORM ops.test_reset();

  -- Insert error log
  INSERT INTO ops.log_events (service, level, message, error_type, source)
  VALUES ('api', 'error', 'Connection refused', 'ConnectionError', 'function');

  SELECT count(*) INTO v_event_count FROM ops.log_events;
  SELECT count(*) INTO v_incident_count FROM ops.incidents;

  RETURN QUERY SELECT
    'test_trigger_creates_incident'::text,
    v_event_count = 1 AND v_incident_count = 1,
    'Trigger automatically created incident for error log'::text;
END;
$$;

-- ── Test 6: Auto-resolution ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.test_auto_resolution()
RETURNS TABLE (test_name text, passed boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_incident_id uuid;
  v_resolved_count int;
BEGIN
  PERFORM ops.test_reset();

  -- Create incident
  INSERT INTO ops.incidents (
    fingerprint, service, environment, title, severity,
    first_seen, last_seen, event_count, status
  ) VALUES (
    'test_fp', 'api', 'production', 'Test Error', 'HIGH',
    now() - interval '12 hours',
    now() - interval '7 hours',
    5,
    'OPEN'
  );

  -- Auto-resolve stale (6+ hours inactive)
  PERFORM ops.auto_resolve_stale_incidents(6);

  SELECT count(*) INTO v_resolved_count
  FROM ops.incidents WHERE status = 'RESOLVED';

  RETURN QUERY SELECT
    'test_auto_resolution'::text,
    v_resolved_count = 1,
    'Stale incidents auto-resolved'::text;
END;
$$;

-- ── Test 7: Error Spike Detection ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.test_spike_detection()
RETURNS TABLE (test_name text, passed boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
DECLARE
  v_has_spike boolean;
  i int;
BEGIN
  PERFORM ops.test_reset();

  -- Insert 10 errors in last 2 minutes
  FOR i IN 1..10 LOOP
    INSERT INTO ops.log_events (service, level, message, error_type, fingerprint, source)
    VALUES ('api', 'error', 'Test error ' || i, 'TestError', 'test_spike_fp', 'function');
  END LOOP;

  v_has_spike := ops.detect_error_spike('test_spike_fp', 5);

  RETURN QUERY SELECT
    'test_spike_detection'::text,
    v_has_spike = true,
    'Spike detected for 10 errors >= threshold'::text;

  -- Test spike not detected below threshold
  PERFORM ops.test_reset();
  FOR i IN 1..2 LOOP
    INSERT INTO ops.log_events (service, level, message, error_type, fingerprint, source)
    VALUES ('api', 'error', 'Test error ' || i, 'TestError', 'test_no_spike_fp', 'function');
  END LOOP;

  v_has_spike := ops.detect_error_spike('test_no_spike_fp', 5);

  RETURN QUERY SELECT
    'test_spike_not_detected'::text,
    v_has_spike = false,
    'Spike not detected for 2 errors < threshold'::text;
END;
$$;

-- ── Run All Tests ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.run_all_tests()
RETURNS TABLE (test_name text, passed boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, public, pg_catalog
AS $$
BEGIN
  RETURN QUERY SELECT * FROM ops.test_log_normalization();
  RETURN QUERY SELECT * FROM ops.test_fingerprinting();
  RETURN QUERY SELECT * FROM ops.test_incident_deduplication();
  RETURN QUERY SELECT * FROM ops.test_severity_classification();
  RETURN QUERY SELECT * FROM ops.test_trigger_incident_creation();
  RETURN QUERY SELECT * FROM ops.test_auto_resolution();
  RETURN QUERY SELECT * FROM ops.test_spike_detection();
END;
$$;

-- Grant test execution to service_role
GRANT EXECUTE ON FUNCTION ops.run_all_tests() TO service_role;
GRANT EXECUTE ON FUNCTION ops.test_log_normalization() TO service_role;
GRANT EXECUTE ON FUNCTION ops.test_fingerprinting() TO service_role;
GRANT EXECUTE ON FUNCTION ops.test_incident_deduplication() TO service_role;
GRANT EXECUTE ON FUNCTION ops.test_severity_classification() TO service_role;
GRANT EXECUTE ON FUNCTION ops.test_trigger_incident_creation() TO service_role;
GRANT EXECUTE ON FUNCTION ops.test_auto_resolution() TO service_role;
GRANT EXECUTE ON FUNCTION ops.test_spike_detection() TO service_role;
