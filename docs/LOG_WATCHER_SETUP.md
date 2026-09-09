# Log Watcher Setup & Deployment

## Prerequisites

- Pulse deployed with Supabase backend
- pg_cron extension available (standard on Supabase)
- ANTHROPIC_API_KEY configured in environment
- Admin Analytics dashboard access

## Installation Steps

### 1. Apply Database Migrations

Run the migration files in order:

```bash
supabase db push --linked
```

This will apply:
1. `20260909000001_log_watcher_schema.sql` - Tables and functions
2. `20260909000002_incident_detection.sql` - Incident detection logic
3. `20260909000003_log_watcher_cron.sql` - Cron scheduler setup
4. `20260909000004_log_watcher_tests.sql` - Test suite

Verify migrations applied:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'ops' AND table_name LIKE 'log_%' OR table_name LIKE 'incident%';

-- Check functions
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'ops' AND routine_name LIKE 'log_%';

-- Check cron jobs
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'log-%';
```

### 2. Verify Test Suite

Run the test suite to confirm all systems are working:

```sql
SELECT * FROM ops.run_all_tests();
```

Expected output: 7 tests, all should PASS.

### 3. Deploy Deno Functions

The scheduler will automatically trigger via pg_cron, but functions must exist:

```bash
# Deploy log watcher functions
supabase functions deploy log-watcher-scheduler
supabase functions deploy log-watcher-investigate
```

Verify they're deployed and callable via HTTP (they have `Deno.serve` handlers for testing).

### 4. Update Analytics App

The LogWatcherPanel component has been added to the admin console.

Build the analytics app:

```bash
npm run build:admin
```

This will:
- Compile LogWatcherPanel.tsx
- Include it in the admin console
- Add "Log Watcher" tab to the admin navigation

### 5. Environment Variables

Ensure these are set in your Supabase function environment:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
ANTHROPIC_API_KEY=sk-ant-...
```

(Service role key needed for read-only access to logs during investigation)

### 6. Test End-to-End

#### Inject a test log event:

```typescript
// From Supabase function or authenticated client
const { data } = await supabase.rpc('ingest_application_log', {
  p_service: 'api',
  p_level: 'error',
  p_message: 'Database connection timeout',
  p_error_type: 'ConnectionError',
  p_status_code: 503,
  p_source: 'function'
});
```

#### Verify incident created:

```sql
SELECT * FROM ops.incidents ORDER BY created_at DESC LIMIT 1;
```

Should show a CRITICAL incident with title containing "connection timeout".

#### Check watcher checkpoint:

```sql
SELECT * FROM ops.watcher_checkpoint WHERE watcher_name = 'log-watcher-scheduler';
```

Should show events_processed incremented.

#### Check admin dashboard:

Navigate to Analytics → Admin → Log Watcher tab.

Should display the test incident.

## Usage

### Injecting Logs from Functions

In any Deno function, call the RPC:

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

try {
  // ... your code ...
} catch (err) {
  await supabase.rpc('ingest_application_log', {
    p_service: 'my-function',
    p_level: 'error',
    p_message: err.message,
    p_error_type: err.name,
    p_request_id: req.id,
    p_source: 'function'
  });
}
```

### From Node.js / Browser

```typescript
const { error } = await supabase.rpc('ingest_application_log', {
  p_service: 'web-app',
  p_level: 'error',
  p_message: 'Failed to fetch user profile',
  p_error_type: 'FetchError',
  p_request_id: correlationId,
  p_route: '/api/profile',
  p_method: 'GET',
  p_status_code: 500,
  p_latency_ms: 5000,
  p_source: 'browser'
});
```

## Monitoring

### View Watcher Health

```sql
SELECT 
  last_successful_run,
  events_processed,
  incidents_created,
  investigations_started,
  failures_total
FROM ops.watcher_checkpoint
WHERE watcher_name = 'log-watcher-scheduler';
```

### View Recent Incidents

```sql
SELECT id, title, severity, status, event_count, created_at
FROM ops.incidents
ORDER BY created_at DESC
LIMIT 20;
```

### View Investigation Results

```sql
SELECT 
  i.id,
  inv.likely_root_cause,
  inv.confidence,
  inv.status
FROM ops.incidents i
LEFT JOIN ops.investigations inv ON i.investigation_id = inv.id
WHERE inv.status = 'COMPLETE'
ORDER BY inv.completed_at DESC
LIMIT 10;
```

### Check Cron Job Status

```sql
-- View cron job schedule and last run
SELECT jobid, jobname, schedule, last_start, last_successful_run
FROM cron.job
WHERE jobname LIKE 'log-watcher%' OR jobname LIKE 'log-%';

-- View recent job run details
SELECT job_id, database, command, status, return_message, exec_time
FROM cron.job_run_details
WHERE job_id IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'log-%')
ORDER BY start_time DESC
LIMIT 20;
```

## Troubleshooting

### Cron Job Not Running

Check pg_cron is enabled:

```sql
SELECT extname FROM pg_extension WHERE extname = 'pg_cron';
```

If not, enable it (project owner only):

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### No Incidents Being Created

1. Check if logs are being ingested:
   ```sql
   SELECT COUNT(*) FROM ops.log_events WHERE captured_at > now() - interval '1 minute';
   ```

2. Check for errors in watcher:
   ```sql
   SELECT * FROM cron.job_run_details WHERE job_id = (SELECT jobid FROM cron.job WHERE jobname = 'log-watcher-main') ORDER BY start_time DESC LIMIT 5;
   ```

3. Verify RPC permissions:
   ```sql
   SELECT * FROM information_schema.role_routine_grants WHERE routine_name = 'ingest_application_log';
   ```

### AI Investigation Not Running

1. Check ANTHROPIC_API_KEY is set in Deno env
2. Verify Claude API is accessible:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "anthropic-version: 2023-06-01"
   ```

3. Check investigation function logs:
   ```bash
   supabase functions logs log-watcher-investigate
   ```

### Dashboard Not Loading

1. Verify LogWatcherPanel.tsx compiled without errors
2. Check analytics build log:
   ```bash
   npm run build --prefix analytics
   ```

3. Ensure ops tables are readable by authenticated role:
   ```sql
   SELECT * FROM ops.incidents LIMIT 1;
   ```

## Cost Control

### Monitor AI Usage

```sql
SELECT 
  COUNT(*) as total_investigations,
  SUM(ai_tokens_used) as total_tokens_used,
  COUNT(*) * 0.003 as estimated_cost_usd  -- Claude Opus pricing
FROM ops.investigations
WHERE completed_at > now() - interval '24 hours';
```

### Throttle Investigations

Edit cron job to reduce frequency or increase incident threshold in log-watcher-scheduler/index.ts.

## Next Steps

1. **Integrate with functions** - Wrap functions with auto-logging middleware
2. **Slack alerts** - Send CRITICAL incidents to #incidents channel
3. **Team routing** - Route incidents by service to responsible teams
4. **Deployment correlation** - Link incidents to git commits
5. **Runbook linking** - Attach playbooks to incident types
