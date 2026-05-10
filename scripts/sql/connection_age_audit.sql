-- ═════════════════════════════════════════════════════════════════════════════
-- CONNECTION AGE AUDIT
-- Diagnose connection churn: short-lived connections (<5s) indicate a leak or
-- transient connection model. Persistent connections (>60s) are healthy.
-- Run in Supabase SQL Editor.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. SNAPSHOT: current connection ages ────────────────────────────────────
-- Shows every client backend with its age. Sort by age_seconds ASC to see
-- the youngest connections — if they cycle through < 5s you have churn.
--
-- Healthy pattern:
--   PostgREST pool: ~5-10 connections, age 300s–3600s (long-lived, reused)
--   Realtime: 1-2 connections, age matches session duration
--   App direct: 0 connections in normal operation (app uses REST, not pg wire)
--
-- Churn pattern:
--   Many connections with age < 5s means each request opens a new connection
--   (no pooler, or Supavisor not configured, or SDK createClient called per-request)

SELECT
  pid,
  application_name,
  state,
  round(extract(epoch from (now() - backend_start))::numeric, 1)  AS age_seconds,
  round(extract(epoch from (now() - state_change))::numeric, 1)   AS state_age_seconds,
  left(query, 80)                                                  AS last_query_snippet,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE backend_type = 'client backend'
ORDER BY age_seconds ASC;


-- ─── 2. HISTOGRAM: connection age distribution ───────────────────────────────
-- Bucket connections by age. Interpret:
--   Many in '<5s' bucket → connection churn (transient model, bad)
--   Many in '5-60s' bucket → short-lived but not catastrophic (pooler issue)
--   Most in '>300s' bucket → persistent model (Supavisor, good)

SELECT
  CASE
    WHEN extract(epoch from (now() - backend_start)) < 5     THEN '< 5s   (churn — new per request)'
    WHEN extract(epoch from (now() - backend_start)) < 30    THEN '5-30s  (short-lived)'
    WHEN extract(epoch from (now() - backend_start)) < 60    THEN '30-60s (warm but not persistent)'
    WHEN extract(epoch from (now() - backend_start)) < 300   THEN '1-5min (acceptable)'
    WHEN extract(epoch from (now() - backend_start)) < 3600  THEN '5-60min (persistent, healthy)'
    ELSE                                                           '>1h    (long-lived, ideal)'
  END                           AS age_bucket,
  application_name,
  count(*)                      AS connection_count
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY 1, 2
ORDER BY
  min(extract(epoch from (now() - backend_start))),
  application_name;


-- ─── 3. SUMMARY STATISTICS: average and median connection age ────────────────
-- Rule of thumb:
--   avg_age_seconds < 5  → CRITICAL: connection churn, every request opens new pg connection
--   avg_age_seconds < 60 → WARNING: pooler not configured or SDK singleton missing
--   avg_age_seconds > 300 → HEALTHY: Supavisor transaction mode pooler is working

SELECT
  application_name,
  count(*)                                                          AS connection_count,
  round(avg(extract(epoch from (now() - backend_start)))::numeric, 1)
                                                                    AS avg_age_seconds,
  round(percentile_cont(0.5) WITHIN GROUP (
    ORDER BY extract(epoch from (now() - backend_start))
  )::numeric, 1)                                                    AS median_age_seconds,
  round(min(extract(epoch from (now() - backend_start)))::numeric, 1)
                                                                    AS min_age_seconds,
  round(max(extract(epoch from (now() - backend_start)))::numeric, 1)
                                                                    AS max_age_seconds
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY application_name
ORDER BY connection_count DESC;


-- ─── 4. CHURN RATE PROXY: connections opened in the last 30 seconds ──────────
-- These are connections so new they haven't finished their first query yet.
-- > 5 in 30s → active churn event happening right now.
-- Combine with query #2 above: if churn is high AND state = 'idle', the pool
-- is opening connections but immediately releasing them (no work queued).

SELECT
  count(*)  AS opened_in_last_30s,
  CASE
    WHEN count(*) > 10 THEN 'RED — active connection storm, check SDK singleton'
    WHEN count(*) > 5  THEN 'YELLOW — elevated churn, monitor'
    ELSE                    'GREEN'
  END       AS status
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND backend_start > now() - interval '30 seconds';


-- ─── 5. LONG-IDLE CONNECTIONS: candidates for culling ────────────────────────
-- Connections idle > 10 minutes are wasting slots in the plan limit.
-- PostgREST should be recycling these; if they persist, check Supavisor idle_timeout config.
-- idle_in_transaction > 5 minutes → blocking VACUUM, should be killed immediately.

SELECT
  pid,
  application_name,
  state,
  round(extract(epoch from (now() - state_change)) / 60.0, 1) AS idle_minutes,
  left(query, 80)   AS last_query
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND state IN ('idle', 'idle in transaction', 'idle in transaction (aborted)')
  AND (now() - state_change) > interval '10 minutes'
ORDER BY idle_minutes DESC;


-- ─── 6. WHAT TO DO BASED ON RESULTS ─────────────────────────────────────────
-- If avg_age_seconds < 5 AND application = 'PostgREST':
--   → Supavisor Transaction Mode pooler is not enabled or not routing through.
--   → Supabase Dashboard → Settings → Database → Connection Pooling
--   → Mode: Transaction, Port: 6543
--   → Your app uses REST API (port 443/5432 via HTTPS), NOT pg wire. The JS SDK
--     never opens a direct pg connection — it calls PostgREST HTTP endpoints.
--   → If you see many short PostgREST connections, it means PostgREST is opening
--     new pg connections per request. Supavisor pools these transparently.
--
-- If avg_age_seconds < 5 AND application = 'your app name':
--   → You are calling createClient() per request in server-side code.
--   → Fix: export a module-level singleton (lib/supabase.ts already does this
--     correctly for the React Native client).
--
-- If idle_in_transaction rows appear:
--   → Run SELECT kill_idle_in_transaction_sessions('5 minutes');
--   → Or schedule via pg_cron (see migration 20260525150000).
