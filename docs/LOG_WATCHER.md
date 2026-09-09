# Pulse Log Watcher Agent

A production incident detection and investigation system that autonomously monitors Pulse application logs, detects abnormal behavior, groups related failures into incidents, and produces AI-assisted diagnoses.

## Architecture

```
Application Logs (console.error/warn)
        ↓
Log Ingestion RPC (ingest_application_log)
        ↓
ops.log_events table
        ↓
Trigger: on_log_event_insert
  ├─ Compute fingerprint
  ├─ Classify severity
  └─ Create/link incident
        ↓
ops.incidents table
        ↓
pg_cron: log-watcher-main (every 60s)
  ├─ Trim old logs
  ├─ Auto-resolve stale incidents
  └─ Find incidents ready for investigation
        ↓
log-watcher-investigate Deno function
  ├─ Gather context (events, error rate, related incidents)
  ├─ Call Claude API with safe tools
  └─ Store investigation results
        ↓
Analytics UI Dashboard
  └─ Display incidents + diagnoses
```

## Database Schema

### `ops.log_events`
Normalized log events from applications with metadata.

**Columns:**
- `id` - Primary key
- `captured_at` - When log was emitted
- `service` - Service name ('api', 'function-*', etc)
- `environment` - 'production', 'staging', etc
- `level` - 'debug', 'info', 'warn', 'error'
- `message` - Log message (sanitized, no secrets)
- `error_type` - Exception class
- `stack_trace` - Stack trace (truncated)
- `request_id` - Correlation ID (if available)
- `user_id_hash` - Hashed user ID (no raw data)
- `route` - API endpoint
- `method` - HTTP method
- `status_code` - HTTP status
- `latency_ms` - Request duration
- `metadata` - Additional context (jsonb, sanitized)
- `fingerprint` - Computed error fingerprint

**Retention:** 30 days (auto-trimmed)

### `ops.incidents`
Grouped log events representing distinct problems.

**Columns:**
- `id` - UUID primary key
- `status` - 'OPEN', 'INVESTIGATING', 'DIAGNOSED', 'RESOLVED', 'IGNORED'
- `severity` - 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
- `service` - Service where incident occurred
- `title` - Human-readable summary
- `fingerprint` - Stable grouping key
- `first_seen`, `last_seen` - Time range
- `event_count` - Number of related log events
- `affected_routes` - Array of affected endpoints
- `affected_users_count` - Approximate unique users
- `investigation_status` - 'PENDING', 'IN_PROGRESS', 'COMPLETE', 'FAILED'
- `diagnosis` - AI diagnosis summary
- `confidence` - 0.0-1.0 confidence score

**Retention:** 90 days (RESOLVED incidents only)

### `ops.investigations`
AI investigation results for incidents.

**Columns:**
- `id` - UUID primary key
- `incident_id` - Link to incident (UNIQUE)
- `status` - 'PENDING', 'IN_PROGRESS', 'COMPLETE', 'FAILED'
- `model` - AI model used ('claude-opus-5')
- `summary` - Investigation summary
- `likely_root_cause` - Best hypothesis
- `confidence` - 0.0-1.0
- `evidence` - Array of supporting evidence
- `affected_components` - Components involved
- `recommended_actions` - What to do
- `unknowns` - Data gaps
- `ai_tokens_used` - Token usage for cost tracking

### `ops.incident_events`
Join table linking log_events to incidents.

### `ops.watcher_checkpoint`
Tracks watcher progress for fault recovery.

**Columns:**
- `watcher_name` - 'log-watcher-scheduler'
- `last_processed_id`, `last_processed_at` - Checkpoint position
- `last_successful_run` - Last successful execution
- `events_processed` - Total events processed
- `incidents_created` - Total incidents created
- `investigations_started` - Total investigations started
- `failures_total` - Failure count

## Incident Detection

### Fingerprinting

Error fingerprinting normalizes dynamic values to group related errors:

- UUIDs → `UUID`
- 32+ hex chars → `HASH`
- Numeric IDs → `ID`
- IP addresses → `IP`
- Timestamps → `TIMESTAMP`

Example:
```
"Failed to load user 550e8400-e29b-41d4-a716-446655440000"
→ "Failed to load user UUID"

"Request from 192.168.1.1 timed out after 5000ms"
→ "Request from IP timed out after Ms"
```

The fingerprint is stable and repeatable, allowing related errors to be grouped into the same incident.

### Severity Classification

Incidents are automatically classified:

- **CRITICAL**: Database unavailable, connection failures, auth broken, 502/503
- **HIGH**: 5xx errors, general failures, major features down
- **MEDIUM**: Warnings, timeouts, recoverable issues
- **LOW**: Debug/info, isolated errors

### Deduplication

Same `fingerprint` + `service` + `environment` within 10-minute window = same incident.

After an incident is resolved, a new spike creates a new incident.

## AI Investigation

### Triggered For

- All **CRITICAL** severity incidents
- **HIGH** severity incidents with >10 events

### Investigation Process

1. **Gather Evidence**
   - Last 50 log events
   - Error rate (last 10 minutes)
   - Related incidents (last 30 minutes)
   - Service health snapshot

2. **AI Analysis**
   - Model: Claude Opus
   - Prompt: Investigate root cause based on evidence
   - Output: Structured diagnosis (JSON)

3. **Store Results**
   - Summary
   - Likely root cause
   - Confidence (0.0-1.0)
   - Evidence array
   - Affected components
   - Recommended actions
   - Data gaps

### Safety Restrictions

The AI agent has **READ-ONLY** access:

✅ **Can read:**
- Log events
- Incident records
- Health snapshots
- Deployment metadata

❌ **Cannot:**
- Modify data
- Delete records
- Execute SQL/shell
- Access secrets/API keys
- Modify configuration
- Send external messages

## Usage

### Ingesting Logs

From any authenticated Supabase function or authenticated client:

```typescript
const { data } = await supabase.rpc('ingest_application_log', {
  p_service: 'api',
  p_level: 'error',
  p_message: 'Database connection timeout',
  p_error_type: 'DatabaseError',
  p_request_id: req.id,
  p_route: '/api/trips',
  p_method: 'POST',
  p_status_code: 500,
  p_latency_ms: 5000,
  p_source: 'function'
});
```

### Querying Incidents

#### Get Incident List (authenticated)

```typescript
const { data } = await supabase.rpc('get_incidents_summary', {
  p_limit: 50,
  p_status: 'OPEN' // optional
});
```

#### Get Incident Details (authenticated)

```typescript
const { data } = await supabase.rpc('get_incident_details', {
  p_incident_id: incidentId
});
```

#### Direct Query (admin/service_role only)

```typescript
const { data } = await supabase
  .from('ops.incidents')
  .select('*')
  .eq('status', 'OPEN')
  .order('updated_at', { ascending: false });
```

### Resolving Incidents

```typescript
await supabase
  .from('ops.incidents')
  .update({ status: 'RESOLVED' })
  .eq('id', incidentId);
```

### Ignoring Incidents

For known false positives:

```typescript
await supabase
  .from('ops.incidents')
  .update({ status: 'IGNORED' })
  .eq('id', incidentId);
```

## Scheduler Behavior

### `log-watcher-main` (every 60 seconds)

1. Load checkpoint
2. Trim old logs (>30 days)
3. Trim old incidents (>90 days resolved)
4. Auto-resolve stale incidents (no activity >6 hours)
5. Find CRITICAL and HIGH incidents pending investigation
6. Create investigation records
7. Queue AI investigation functions
8. Update checkpoint

### Investigation Function

1. Load incident + investigation record
2. Gather context from log events, error rates, related incidents
3. Call Claude API with investigation prompt
4. Store results in investigations table
5. Update incident with diagnosis + confidence

## Testing

Run full test suite:

```sql
SELECT * FROM ops.run_all_tests();
```

Individual tests:

```sql
SELECT * FROM ops.test_log_normalization();
SELECT * FROM ops.test_fingerprinting();
SELECT * FROM ops.test_incident_deduplication();
SELECT * FROM ops.test_severity_classification();
SELECT * FROM ops.test_trigger_incident_creation();
SELECT * FROM ops.test_auto_resolution();
SELECT * FROM ops.test_spike_detection();
```

## Dashboard

The **Log Watcher** section in the Analytics admin panel shows:

- **Incident List**: Filterable by status (All/Open/Critical)
- **Incident Details**: Events, AI diagnosis, recommended actions
- **Quick Actions**: Resolve, Ignore incidents
- **Real-time Refresh**: Updates every 10 seconds

Access at: `/analytics` → Admin → Log Watcher

## Configuration

### Environment Variables

```
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
```

### Retention Policies

| Table | Retention | Auto-trim |
|-------|-----------|-----------|
| log_events | 30 days | Every 4 hours |
| incidents | 90 days (resolved only) | Every 4 hours |
| db_health_snapshots | 7 days | Every capture |
| slow_query_log | 30 days | Every capture |

### Cron Schedule

| Job | Schedule | Purpose |
|-----|----------|---------|
| log-watcher-main | Every 60 sec | Poll incidents, trigger investigations |
| log-watcher-cleanup | Every 4 hours | Trim old logs and incidents |
| log-watcher-health | Every 60 sec | Capture DB health |

## Limitations

1. **No console log ingestion yet** - Requires explicit RPC calls from functions/apps. Browser console logs not automatically captured.

2. **Limited deployment correlation** - Cannot automatically link incidents to deployments without explicit metadata.

3. **No metric comparison** - Would benefit from Prometheus/Grafana integration for latency/throughput metrics.

4. **No alert routing** - Currently dashboard-only. Could integrate with Slack/PagerDuty.

5. **Investigation latency** - Runs every 60 seconds, so detection lag up to 1 minute.

6. **Token limits** - AI investigation capped at 8000 tokens to control costs.

## Security Model

- **Read-only for AI**: Investigation agent cannot modify anything
- **No secret exposure**: All PII/secrets scrubbed before AI sees logs
- **User ID hashing**: Only hashed user IDs stored (no raw data)
- **Authenticated access**: All APIs require auth or service_role
- **Data isolation**: Separate `ops` schema with explicit grants

## Cost Control

- **Deduplication**: Same error → 1 investigation (not N)
- **Filtering**: Only CRITICAL/HIGH incidents investigated
- **Token limits**: 8000 tokens max per investigation
- **Investigation cooldown**: 5 minutes between investigations per incident
- **Auto-cleanup**: Old logs pruned every 4 hours

## Observability

The watcher itself is observable:

```sql
SELECT * FROM ops.watcher_checkpoint
WHERE watcher_name = 'log-watcher-scheduler';
```

Tracks:
- Events processed
- Incidents created
- Investigations started
- Failures
- Last successful run

## Next Steps

1. **Auto log ingestion** - Deno middleware to auto-inject into all functions
2. **Slack/PagerDuty alerts** - Route CRITICAL incidents to on-call
3. **Deployment correlation** - Link incidents to deploy metadata
4. **Custom rules** - User-defined alert rules and thresholds
5. **Metrics integration** - Pull latency/throughput from db_health_snapshots
6. **Incident runbooks** - Link to playbooks per incident type
7. **Team assignment** - Route to specific teams by service/component
