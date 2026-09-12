-- =============================================================================
-- pg_cron "job startup timeout" incident detection (best-effort, pg_cron path)
-- =============================================================================
-- CONTEXT
-- A multi-round forensic investigation (2026-09-10) traced repeated
-- "job startup timeout" failures across several pg_cron jobs (observed at
-- 04:00, 04:30, and 04:39-04:44 UTC) back to pg_cron's own 10-second
-- CronTaskStartTimeout (v1.6.4 source, cron.use_background_workers = off in
-- this project). The investigation exhausted every available read-only
-- evidence source (pg_stat_activity, pg_stat_statements, pg_locks,
-- pg_cron 1.6.4 source, cron.job_run_details, ops.db_health_snapshots) and
-- confirmed:
--   - the scheduler's own poll()/timeout math cannot produce the observed
--     ~42-52s gap (poll() is hard-capped at 1s per call, and
--     task->startDeadline is included in its wake-up calculation);
--   - pg_cron's own synchronous job_run_details bookkeeping SQL is a
--     plausible but UNPROVEN contributor (no timestamped record ties any
--     specific slow execution to the incident windows);
--   - postgres_logs (the one source that could resolve this) was
--     unavailable on every attempt across the whole investigation.
--
-- ROOT CAUSE REMAINS UNKNOWN. This migration does not claim to fix or
-- explain the underlying cause. It exists solely so that the NEXT
-- occurrence of this failure signature is detected, evidence is captured
-- while it is happening, and a human is alerted -- instead of the
-- investigation ending in UNKNOWN again for lack of a live capture.
--
-- DESIGN NOTES
--   - Reuses the existing ops.incidents table (see
--     20260909000001_log_watcher_schema.sql) rather than introducing a
--     parallel incident table. fingerprint = 'pg_cron_startup_timeout'
--     identifies this specific failure class; affected_routes is repurposed
--     to hold the list of affected pg_cron job names (text[] already exists
--     on the table for exactly this "list of affected things" shape).
--   - "At most one OPEN incident for this fingerprint" is enforced by a
--     partial unique index, not application-level locking, so both the
--     pg_cron path (this migration) and the external path (separate, see
--     the accompanying Edge Function) can safely race to create/update it.
--   - Uses pg_try_advisory_xact_lock (transaction-scoped), matching the
--     fix already applied in 20261123000000_fix_cron_advisory_lock_leak_
--     and_slow_dispatch.sql for exactly this reason: session-scoped locks
--     can leak under pooling and wedge every future run. No manual unlock,
--     no EXCEPTION shim needed.
--   - Diagnostic snapshot capture is a SEPARATE function call from incident
--     recording, and is wrapped so that a failure in any one diagnostic
--     query never rolls back the incident row or aborts the other queries.
--   - Slack alerting is explicitly best-effort: this function only performs
--     detection + evidence capture. Alert dispatch (with the "send before
--     marking alerted_at" ordering) happens in the calling layer (the
--     guarded cron wrapper below, and separately the external Edge
--     Function), not inside a single all-or-nothing SQL transaction, since
--     net.http_post here is fire-and-forget async (same caveat already
--     documented in 20261123000000 for this exact reason) and cannot itself
--     confirm delivery.

-- ── 1. One-open-incident-per-fingerprint enforcement ─────────────────────────
-- ops.incidents (20260909000001_log_watcher_schema.sql) has no alerted_at
-- column; add it here, used only by this incident class (existing log-watcher
-- incidents leave it NULL and are unaffected).
ALTER TABLE ops.incidents ADD COLUMN IF NOT EXISTS alerted_at timestamptz;

-- Partial unique index: at most one OPEN row per fingerprint. This is the
-- entire correlation mechanism -- Postgres enforces it, no coordination
-- service required.
CREATE UNIQUE INDEX IF NOT EXISTS ops_incidents_one_open_per_fingerprint
  ON ops.incidents (fingerprint)
  WHERE status = 'OPEN';

-- ── 2. Snapshot table for point-in-time diagnostic evidence ──────────────────
CREATE TABLE IF NOT EXISTS ops.cron_incident_snapshots (
  id                 bigserial PRIMARY KEY,
  incident_id        uuid NOT NULL REFERENCES ops.incidents(id) ON DELETE CASCADE,
  captured_at        timestamptz NOT NULL DEFAULT now(),
  captured_by        text NOT NULL CHECK (captured_by IN ('pg_cron', 'external')),
  launcher_state     jsonb,
  lock_contention    jsonb,
  active_count       int,
  idle_in_txn_count  int,
  total_conns        int,
  capture_errors     jsonb  -- {"launcher_state": "...", "lock_contention": "...", ...} per-field failure notes
);

CREATE INDEX IF NOT EXISTS idx_cron_incident_snapshots_incident_id
  ON ops.cron_incident_snapshots(incident_id, captured_at DESC);

REVOKE ALL ON ops.cron_incident_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON ops.cron_incident_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ops.cron_incident_snapshots_id_seq TO service_role;

-- ── 3. Detection + incident upsert (called by both the pg_cron path and the
--       external Edge Function path with identical semantics) ──────────────
CREATE OR REPLACE FUNCTION ops.detect_cron_startup_timeout_incident(
  p_detected_by text  -- 'pg_cron' | 'external'
)
RETURNS TABLE (incident_id uuid, needs_alert boolean, affected_jobs jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
  v_quiet_interval CONSTANT interval := interval '10 minutes';
  v_streak_window  CONSTANT interval := interval '10 minutes';
  v_new_jobs jsonb;
  v_last_failure timestamptz;
  v_incident_id uuid;
BEGIN
  IF p_detected_by NOT IN ('pg_cron', 'external') THEN
    RAISE EXCEPTION 'invalid p_detected_by: %', p_detected_by;
  END IF;

  -- Lazy closure: close any OPEN incident whose trail has gone quiet.
  -- This runs on every call from either path, so closure never depends on
  -- a dedicated background job.
  UPDATE ops.incidents
  SET status = 'RESOLVED',
      updated_at = now()
  WHERE fingerprint = 'pg_cron_startup_timeout'
    AND status = 'OPEN'
    AND last_seen < now() - v_quiet_interval;

  -- Per-job qualifying streak: 3 consecutive job startup timeout failures
  -- within the streak window, for any job. A non-matching status (success,
  -- or a failure with a different message) breaks that job's streak.
  WITH recent AS (
    SELECT jrd.jobid, j.jobname, jrd.status, jrd.return_message, jrd.start_time,
           row_number() OVER (PARTITION BY jrd.jobid ORDER BY jrd.start_time DESC) AS rn
    FROM cron.job_run_details jrd
    JOIN cron.job j ON j.jobid = jrd.jobid
    WHERE jrd.start_time > now() - v_streak_window
  ),
  streaks AS (
    SELECT jobid, jobname, max(start_time) AS last_failure
    FROM recent
    WHERE rn <= 3
    GROUP BY jobid, jobname
    HAVING count(*) FILTER (
      WHERE status = 'failed' AND return_message = 'job startup timeout'
    ) = 3
  )
  SELECT jsonb_agg(jsonb_build_object('jobid', jobid, 'jobname', jobname)),
         max(last_failure)
  INTO v_new_jobs, v_last_failure
  FROM streaks;

  IF v_new_jobs IS NULL THEN
    -- Nothing qualifying right now; report the current OPEN incident (if
    -- any) so the caller has a consistent return shape, but do not create
    -- or touch anything.
    SELECT i.id INTO v_incident_id
    FROM ops.incidents i
    WHERE i.fingerprint = 'pg_cron_startup_timeout' AND i.status = 'OPEN';

    RETURN QUERY SELECT v_incident_id, false, '[]'::jsonb;
    RETURN;
  END IF;

  -- Atomic upsert: reuse an existing OPEN incident for this fingerprint if
  -- one exists (ON CONFLICT branch), otherwise create one. Both detection
  -- paths run this identical statement, so Postgres's own conflict
  -- resolution -- not application logic -- is what prevents duplicates.
  INSERT INTO ops.incidents (
    status, severity, service, title, fingerprint,
    first_seen, last_seen, event_count, affected_routes
  )
  VALUES (
    'OPEN', 'HIGH', 'postgres-cron', 'pg_cron job startup timeout',
    'pg_cron_startup_timeout',
    v_last_failure, v_last_failure, 1,
    ARRAY(SELECT jsonb_array_elements(v_new_jobs) ->> 'jobname')
  )
  ON CONFLICT (fingerprint) WHERE status = 'OPEN'
  DO UPDATE SET
    last_seen = greatest(ops.incidents.last_seen, excluded.last_seen),
    event_count = ops.incidents.event_count + 1,
    affected_routes = ARRAY(
      SELECT DISTINCT unnest(ops.incidents.affected_routes || excluded.affected_routes)
    ),
    updated_at = now()
  RETURNING id INTO v_incident_id;

  RETURN QUERY
  SELECT v_incident_id,
         -- needs_alert is derived from the SAME row this statement just
         -- wrote/updated, inside the same function invocation -- not a
         -- separate SELECT after the fact. This closes the read-after-write
         -- race for determining alert-worthiness, though it does not (and
         -- per the accompanying design review, does not need to) make the
         -- Slack *send* itself exactly-once -- see Slack alerting note below.
         (SELECT alerted_at IS NULL FROM ops.incidents WHERE id = v_incident_id),
         v_new_jobs;
END;
$$;

REVOKE ALL ON FUNCTION ops.detect_cron_startup_timeout_incident(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.detect_cron_startup_timeout_incident(text) TO service_role;

-- ── 4. Best-effort diagnostic snapshot capture ───────────────────────────────
-- Each diagnostic source is captured independently; a failure in one does
-- not prevent the others from being captured, and never rolls back the
-- already-recorded incident (this function is called separately from
-- detect_cron_startup_timeout_incident, in its own statement/transaction).
CREATE OR REPLACE FUNCTION ops.capture_cron_incident_snapshot(
  p_incident_id uuid,
  p_captured_by text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
  v_launcher_state jsonb;
  v_lock_contention jsonb;
  v_active_count int;
  v_idle_in_txn_count int;
  v_total_conns int;
  v_errors jsonb := '{}'::jsonb;
BEGIN
  IF p_captured_by NOT IN ('pg_cron', 'external') THEN
    RAISE EXCEPTION 'invalid p_captured_by: %', p_captured_by;
  END IF;

  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
             'pid', pid, 'state', state, 'wait_event_type', wait_event_type,
             'wait_event', wait_event, 'query', query,
             'query_age_seconds', extract(epoch FROM (now() - query_start))
           ))
    INTO v_launcher_state
    FROM pg_stat_activity
    WHERE backend_type = 'pg_cron launcher';
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('launcher_state', SQLERRM);
  END;

  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
             'pid', l.pid, 'mode', l.mode, 'granted', l.granted,
             'locktype', l.locktype,
             'relation', l.relation::regclass::text,
             'query', a.query, 'wait_event', a.wait_event,
             'backend_type', a.backend_type
           ))
    INTO v_lock_contention
    FROM pg_locks l
    JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE NOT l.granted;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('lock_contention', SQLERRM);
  END;

  BEGIN
    SELECT count(*) FILTER (WHERE state = 'active'),
           count(*) FILTER (WHERE state = 'idle in transaction'),
           count(*)
    INTO v_active_count, v_idle_in_txn_count, v_total_conns
    FROM pg_stat_activity;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('activity_summary', SQLERRM);
  END;

  BEGIN
    INSERT INTO ops.cron_incident_snapshots (
      incident_id, captured_by, launcher_state, lock_contention,
      active_count, idle_in_txn_count, total_conns, capture_errors
    ) VALUES (
      p_incident_id, p_captured_by, v_launcher_state, v_lock_contention,
      v_active_count, v_idle_in_txn_count, v_total_conns,
      CASE WHEN v_errors = '{}'::jsonb THEN NULL ELSE v_errors END
    );
  EXCEPTION WHEN OTHERS THEN
    -- Snapshot capture is best-effort end-to-end: even the INSERT itself
    -- failing must not propagate and must not affect the caller's other
    -- work (e.g. the already-committed incident row, or alert dispatch).
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION ops.capture_cron_incident_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.capture_cron_incident_snapshot(uuid, text) TO service_role;

-- ── 5. Secondary (best-effort) pg_cron-based detector ────────────────────────
-- This is explicitly the SECONDARY path (see architecture notes above): it
-- is itself a pg_cron job, so it can be delayed/fail exactly like the jobs
-- it is trying to detect failures for. It exists to catch cases where
-- pg_cron is degraded but not completely unable to run anything, and as a
-- redundant confirmation of whatever the external path already found.
-- Transaction-scoped advisory lock (not session-scoped) per the
-- 20261123000000 fix, so a lock can never leak/wedge future runs.
CREATE OR REPLACE FUNCTION public.detect_cron_incident_guarded()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops, pg_catalog
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('detect_cron_incident_guarded', 0);
  v_result record;
  v_service_role_key text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN;
  END IF;

  SET LOCAL statement_timeout = '10s';

  SELECT * INTO v_result FROM ops.detect_cron_startup_timeout_incident('pg_cron');

  IF v_result.incident_id IS NOT NULL THEN
    -- Best-effort snapshot; failures inside are already swallowed by the
    -- function itself and must not affect anything below.
    PERFORM ops.capture_cron_incident_snapshot(v_result.incident_id, 'pg_cron');

    IF v_result.needs_alert THEN
      -- Fire-and-forget async HTTP call (pg_net) to Slack. This does NOT
      -- confirm delivery -- see the alerting note in the migration header
      -- and the accompanying design doc: Slack delivery here is
      -- best-effort, and alerted_at is intentionally NOT set from this
      -- fire-and-forget call, so a delivery failure is retried by the next
      -- detection cycle (either path) rather than being silently lost.
      -- Marking alerted_at from a confirmed HTTP response is done by the
      -- external Edge Function path, which can synchronously await the
      -- Slack response; this pg_cron path intentionally does not attempt
      -- to replicate that here to avoid adding a second synchronous
      -- network call inside the pg_cron launcher's own blocking path --
      -- exactly the kind of synchronous-call-inside-the-launcher pattern
      -- this whole investigation was scoped around.
      SELECT decrypted_secret INTO v_service_role_key
      FROM vault.decrypted_secrets WHERE name = 'service_role_key';

      IF v_service_role_key IS NOT NULL THEN
        PERFORM net.http_post(
          url := current_setting('app.supabase_url', true) || '/functions/v1/cron-incident-alert',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_service_role_key,
            'Content-Type', 'application/json'
          ),
          body := jsonb_build_object(
            'incident_id', v_result.incident_id,
            'affected_jobs', v_result.affected_jobs,
            'detected_by', 'pg_cron'
          ),
          timeout_milliseconds := 5000
        );
      END IF;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_cron_incident_guarded() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_cron_incident_guarded() TO service_role;

SELECT cron.schedule(
  'detect-cron-startup-timeout-incident',
  '*/2 * * * *',
  $$SELECT public.detect_cron_incident_guarded();$$
);

-- ── 6. Retention for the new snapshot table ───────────────────────────────────
-- Mirrors prune_cron_job_run_details (20261120000002): daily, transaction-
-- scoped advisory lock, bounded statement_timeout. Snapshots are only ever
-- written during an active incident, so volume is expected to be low;
-- 14-day retention (longer than job_run_details' 3 days) since these rows
-- are the primary forensic evidence for a rare event and are worth keeping
-- longer.
CREATE OR REPLACE FUNCTION public.prune_cron_incident_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops, pg_catalog
AS $$
DECLARE
  v_lock_key CONSTANT bigint := hashtextextended('prune_cron_incident_snapshots', 0);
BEGIN
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN;
  END IF;

  SET LOCAL statement_timeout = '30s';
  DELETE FROM ops.cron_incident_snapshots
  WHERE captured_at < now() - INTERVAL '14 days';
END;
$$;

REVOKE ALL ON FUNCTION public.prune_cron_incident_snapshots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_cron_incident_snapshots() TO service_role;

SELECT cron.schedule(
  'prune-cron-incident-snapshots',
  '0 4 * * *',
  $$SELECT public.prune_cron_incident_snapshots();$$
);
