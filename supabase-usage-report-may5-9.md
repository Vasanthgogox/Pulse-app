# Supabase Usage Report — May 5–9, 2026

**Project:** nihas-gogox's Project (`nafxpivddesgsrthmosv`)
**Region:** ap-south-1 (Mumbai)
**Generated:** 2026-05-09

---

## Auth

| Metric | Value |
|--------|-------|
| Total registered users | 64 |
| Active users (signed in May 5–9) | 30 |

### New Signups by Day

| Day | New Users |
|-----|-----------|
| May 5 | 1 |
| May 6 | 8 |
| May 7 | 3 |
| May 8 | 2 |
| May 9 | 0 |
| **Total** | **14** |

---

## Database Connections

| Day | Avg Total | Avg Active | Peak | Long Queries | Peak Realtime |
|-----|-----------|------------|------|--------------|---------------|
| May 6 | 23.5 | 1.4 | 60 | 0 | 8 |
| May 7 | 21.5 | 1.5 | **65** | 1 | 9 |
| May 8 | 17.8 | 1.3 | 64 | 0 | 8 |
| May 9 | 13.8 | 1.1 | 40 | 0 | 8 |

> May 5 data unavailable — health snapshots began May 6.
> May 9 data is partial (day in progress).

### Peak Connection Events

| Timestamp (UTC) | Total | Active | Idle | Realtime | Top Query |
|-----------------|-------|--------|------|----------|-----------|
| 2026-05-07 05:11 | **65** | 2 | 55 | 8 | `ops.capture_db_health_snapshot()` |
| 2026-05-08 07:20 | 64 | 6 | 50 | 8 | PostgREST schema introspection (22s) |
| 2026-05-07 07:55 | 64 | 2 | 54 | 8 | `ops.capture_db_health_snapshot()` |
| 2026-05-07 15:42 | 62 | 8 | 46 | 8 | `trip_conversations` query (15.38s) |
| 2026-05-08 06:55 | 62 | 19 | 51 | 8 | Idle connection cleanup job |

---

## Database Size

| Metric | Value |
|--------|-------|
| Total DB size | 26 MB |
| Table data size | 12 MB |

---

## Root Cause: Peak Connection Issue

### 1. Idle Connection Accumulation (Primary Cause)

During the peak on May 7 at 05:11 UTC, **55 of 65 connections were idle** — only 2 were actively executing queries. This means connections were opened but not released back to a pool. This is the classic symptom of **no connection pooler** or clients connecting directly to Postgres (port 5432) instead of through Supavisor (port 6543).

In this app, `lib/supabase.ts` creates a singleton Supabase client. However, on React Native / Expo, each app session (and potentially each Realtime subscription) can hold open a direct Postgres connection. With 30 active users over this period and multiple background subscriptions per session, idle connections accumulate quickly.

### 2. Realtime Subscription Proliferation (Secondary Cause)

Realtime connections held steady at **8–9** across all days. The codebase uses `useRealtimeInvalidation` which subscribes per-org per-table on component mount. If multiple screens mount simultaneously (e.g. trips + finance tabs both active), each creates a new channel without cleaning up the previous one. This drives up persistent connections.

Confirmed by the WAL query appearing in peak snapshots:
```sql
SELECT wal->>'type' as type, wal->>'schema' as schema, ...
```
This is Supabase Realtime polling WAL — indicating active but unnecessary open channels.

### 3. Slow Queries Holding Connections (Contributing Cause)

Two slow queries were captured during high-connection windows:

- **`trip_conversations` query — 15.38 seconds** (May 7, 15:42 UTC)
  ```sql
  SELECT "public"."trip_conversations"."organization_id"
  FROM "public"."trip_conversations"
  WHERE "public"."trip_conversations"."id" = $1
  LIMIT $2 OFFSET $3
  ```
  This PostgREST-generated query is doing a full scan or missing an index on `trip_conversations.id`.

- **PostgREST schema introspection — 22 seconds** (May 8, 07:20 UTC)
  This runs when PostgREST restarts or reloads its schema cache. It briefly spikes active connections while scanning all table/column metadata.

---

## Fixes & Recommendations

### Fix 1: Use Supavisor (Transaction Mode Pooler) — Highest Impact

Switch all client connections from port `5432` (direct Postgres) to port `6543` (Supavisor transaction mode). Supavisor multiplexes hundreds of client connections into a small number of server-side Postgres connections, eliminating idle connection buildup.

In `lib/supabase.ts`, ensure the connection string / `db` config uses the pooler URL:

```
postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

Or in the Supabase dashboard: **Project Settings → Database → Connection Pooling → Transaction mode**.

> The `anon`/`service_role` keys don't need to change — only the DB host/port matters for direct DB connections. The JS client (`supabase-js`) connects via HTTP/WebSocket, so this mainly affects any direct `pg` / `postgres.js` connections if used in Edge Functions or scripts.

### Fix 2: Cap and Clean Up Realtime Channels

In `lib/queries/useRealtimeInvalidation.ts`, ensure every `channel.subscribe()` is paired with an `unsubscribe()` in the cleanup function, and deduplicate channels by key so re-renders don't stack new subscriptions.

```ts
// Current risk: new channel opened on every mount
useEffect(() => {
  const channel = supabase().channel(`trips:${orgId}`)
  channel.on('postgres_changes', ...).subscribe()

  return () => {
    supabase().removeChannel(channel)  // ensure this runs
  }
}, [orgId])
```

Also check `lib/realtimeRegistry.ts` — if it's not deduplicating by channel name, multiple mounts will create duplicate subscriptions. Use `realtimeRegistry` consistently and never bypass it with direct `supabase().channel()` calls.

### Fix 3: Add Index on `trip_conversations.id`

The 15-second query on `trip_conversations` is a sign of a missing or unused index. Verify:

```sql
-- Check existing indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'trip_conversations';

-- If none on id, add:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trip_conversations_id
ON public.trip_conversations(id);
```

Since `id` is likely the primary key, also verify RLS policies on this table are not causing full scans:

```sql
EXPLAIN ANALYZE
SELECT organization_id FROM trip_conversations WHERE id = '...';
```

### Fix 4: Set `statement_timeout` for Long-Running Queries

Add a statement timeout to prevent slow queries from holding connections indefinitely:

```sql
-- In Supabase Dashboard → SQL Editor or migration
ALTER ROLE authenticator SET statement_timeout = '10s';
ALTER ROLE anon SET statement_timeout = '10s';
ALTER ROLE authenticated SET statement_timeout = '10s';
```

In the app, the fetch wrapper in `lib/supabase.ts` already has a 25s timeout — tighten it to 10s to align with DB-level limits.

### Fix 5: Idle Connection Cleanup (Already Partially in Place)

The health snapshots show this cleanup job running on May 8:
```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < now() - interval '10 minutes'
  AND pid <> pg_backend_pid()
  AND usename NOT IN ('supabase_admin', 'postgres')
  AND coalesce(application_name, '') NOT LIKE 'Supavisor%';
```

This is good. Confirm it runs regularly via `pg_cron`. If it's not scheduled:

```sql
SELECT cron.schedule(
  'cleanup-idle-connections',
  '*/10 * * * *',
  $$
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE state = 'idle'
      AND state_change < now() - interval '10 minutes'
      AND pid <> pg_backend_pid()
      AND usename NOT IN ('supabase_admin','postgres')
      AND coalesce(application_name,'') NOT LIKE 'Supavisor%';
  $$
);
```

---

## Summary

| Issue | Impact | Fix |
|-------|--------|-----|
| Idle connections (55/65 idle at peak) | High | Use Supavisor pooler (port 6543) |
| Realtime channel proliferation | Medium | Deduplicate + enforce cleanup in `useRealtimeInvalidation` |
| `trip_conversations` slow query (15s) | Medium | Add index, review RLS policies |
| PostgREST schema introspection (22s) | Low | Normal on restart; reduce PostgREST restarts |
| No `statement_timeout` | Low | Set 10s timeout on DB roles |
