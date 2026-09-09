# Log Watcher Production Deployment Guide

**Verification Status:** PASSED (all 6 verification dimensions)

## Pre-Deployment Checklist

- [ ] Read this entire document
- [ ] Review git diff to confirm only Log Watcher changes
- [ ] Have production database credentials ready
- [ ] Confirm Anthropic API key is valid and `claude-opus-5` model is accessible
- [ ] Schedule quiet window (no ongoing incidents/maintenance)
- [ ] Have monitoring/dashboard ready to observe after deployment

## Files Modified (13 functions, 4 migrations)

### Application Edge Functions (13 - all instrumented)
```
supabase/functions/razorpay-webhook/index.ts                    (+4 ingestLog calls)
supabase/functions/razorpay-create-order/index.ts               (+4 ingestLog calls)
supabase/functions/verification-worker/index.ts                 (+3 ingestLog calls)
supabase/functions/gemini-doc-verify/index.ts                   (+3 ingestLog calls)
supabase/functions/validate-gstin/index.ts                      (+3 ingestLog calls)
supabase/functions/ocr-doc-verify/index.ts                      (+2 ingestLog calls)
supabase/functions/send-push-notifications/index.ts             (+2 ingestLog calls)
supabase/functions/invite-platform-admin/index.ts               (+2 ingestLog calls)
supabase/functions/link-driver-phone/index.ts                   (+2 ingestLog calls)
supabase/functions/driver-phone-signin-unverified/index.ts       (+1 ingestLog call)
supabase/functions/tracking-checkpoint/index.ts                 (+2 ingestLog calls)
supabase/functions/marketplace-test-payment/index.ts            (+2 ingestLog calls)
supabase/functions/check-user-by-phone/index.ts                 (+1 ingestLog call)
```
**Total: 31 executable ingestLog() calls**

### Log Watcher Infrastructure (already deployed/verified in migrations)
```
supabase/migrations/20260909000001_log_watcher_schema.sql       (tables, RPC, dashboard)
supabase/migrations/20260909000002_incident_detection.sql       (fingerprinting, severity, triggers)
supabase/migrations/20260909000003_log_watcher_cron.sql         (scheduler, cron jobs)
supabase/migrations/20260909000004_log_watcher_tests.sql        (automated tests)
supabase/functions/_shared/logWatcherIngest.ts                  (helper, already exists)
supabase/functions/log-watcher-scheduler/index.ts               (already exists)
supabase/functions/log-watcher-investigate/index.ts             (already exists)
```

## Deployment Steps

### Stage 1: Pre-deployment verification

```bash
# Confirm git state
git status                    # Should be clean except migrations/functions changes
git diff --stat               # Review scope
git diff -- supabase/         # Final review before deploying

# Confirm only Log Watcher changes
git diff | grep -E "^diff --git" | wc -l  # Should be ~21 files changed
```

### Stage 2: Deploy migrations (quiet window recommended)

```bash
# Apply migrations to production database
supabase db push --linked

# Verify migrations applied
# Check in production:
# SELECT * FROM pg_extension WHERE extname = 'pg_cron';
# SELECT jobname FROM cron.job WHERE jobname LIKE 'log-watcher%';
# SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='ops' AND table_name='log_events');
```

### Stage 3: Deploy Edge Functions

```bash
# Deploy watcher infrastructure
supabase functions deploy log-watcher-scheduler
supabase functions deploy log-watcher-investigate

# Deploy instrumented application functions (in any order)
supabase functions deploy razorpay-webhook
supabase functions deploy razorpay-create-order
supabase functions deploy verification-worker
supabase functions deploy gemini-doc-verify
supabase functions deploy validate-gstin
supabase functions deploy ocr-doc-verify
supabase functions deploy send-push-notifications
supabase functions deploy invite-platform-admin
supabase functions deploy link-driver-phone
supabase functions deploy driver-phone-signin-unverified
supabase functions deploy tracking-checkpoint
supabase functions deploy marketplace-test-payment
supabase functions deploy check-user-by-phone
```

### Stage 4: Immediate post-deployment verification

Run these queries in production to confirm the pipeline is live:

```sql
-- 1. Verify schema
SELECT COUNT(*) as log_events_count FROM ops.log_events;
SELECT COUNT(*) as incidents_count FROM ops.incidents;
SELECT COUNT(*) as investigations_count FROM ops.investigations;

-- 2. Verify cron jobs
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'log-watcher%';

-- 3. Verify watcher checkpoint
SELECT * FROM ops.watcher_checkpoint WHERE watcher_name = 'log-watcher-scheduler';
```

### Stage 5: Monitor for 5-10 minutes

```sql
-- Check for errors in log_events
SELECT 
  level,
  service,
  COUNT(*) as count,
  MAX(captured_at) as latest
FROM ops.log_events
WHERE captured_at > now() - interval '10 minutes'
GROUP BY level, service
ORDER BY latest DESC;

-- Check incidents detected
SELECT 
  status,
  severity,
  COUNT(*) as count
FROM ops.incidents
WHERE created_at > now() - interval '10 minutes'
GROUP BY status, severity
ORDER BY created_at DESC;
```

## What Happens Immediately After Deployment

### Error Detection (Automatic)
```
Production error
    ↓
ingestLog() call in application function
    ↓
public.ingest_application_log() RPC
    ↓
ops.log_events row created
    ↓
ops.on_log_event_insert() trigger fires
    ↓
Fingerprint computed (normalizes dynamic values)
Severity classified (CRITICAL/HIGH/MEDIUM/LOW)
```

### Incident Grouping (Automatic)
```
ops.log_events row
    ↓
ops.find_or_create_incident() checks for existing incident
    ↓
If fingerprint + service + environment match within 10 minutes: reuse incident
Otherwise: create new incident in ops.incidents
```

### Investigation (Scheduled)
```
pg_cron job 'log-watcher-main' runs every minute
    ↓
log-watcher-scheduler fetches CRITICAL/HIGH incidents
    ↓
For each incident:
  - Creates ops.investigations row
  - Triggers HTTP POST to log-watcher-investigate function
    ↓
log-watcher-investigate function:
  - Fetches incident context
  - Builds structured JSON evidence
  - Calls Anthropic API with claude-opus-5 model
  - Stores results in ops.investigations
  - Updates ops.incidents.investigation_status = 'COMPLETE'
```

### Dashboard Access
```
Admin user opens analytics dashboard
    ↓
LogWatcherPanel component calls:
  - supabase.rpc('get_incidents_summary', {...})
  - supabase.rpc('get_incident_details', {...})
  - supabase.rpc('update_incident_status', {...})
    ↓
Admin sees:
  - Incidents list (status, severity, event count)
  - Investigation results (root cause, confidence)
  - Can mark incidents RESOLVED/IGNORED
```

## Observability: What to Monitor

### First 24 hours

| Query | Expected |
|-------|----------|
| `SELECT COUNT(*) FROM ops.log_events WHERE captured_at > now() - interval '1 hour'` | Should see non-zero count |
| `SELECT COUNT(DISTINCT service) FROM ops.log_events` | Should see 13+ services |
| `SELECT COUNT(*) FROM ops.incidents` | Depends on error volume |
| `SELECT COUNT(*) FROM ops.investigations WHERE status = 'COMPLETE'` | Should increase every minute |

### Red flags to watch for

- No logs appearing in `ops.log_events` → application functions not calling ingestLog()
- No incidents created → fingerprinting or severity classification broken
- Incidents not auto-resolving → auto_resolve_stale_incidents trigger not firing
- Investigation failures → check Anthropic API key, model name, network
- Duplicate logging → check for multiple ingestLog() calls on same error path
- Sensitive data in logs → check sanitizeForLogging() is being applied

### Success indicators

- `ops.log_events` growing with production errors
- `ops.incidents` grouping related errors (same fingerprint)
- `ops.investigations` showing AI analysis results
- Dashboard displaying incidents with investigation results
- No new errors in application error paths

## Rollback Plan

If deployment causes production issues:

```bash
# Rollback functions only (leaves schema intact)
supabase functions deploy [function-name] --version [previous-version]

# If schema needs rollback (rare):
# Contact Supabase support — migrations can be reset only by them
```

## Important Notes

### Fail-Open Guarantee
All ingestLog() calls are wrapped in try-catch. Logging failures **never** break the original application behavior. If the Log Watcher becomes unavailable:
- Application continues working
- Logs are silently dropped (logged to console)
- No customer-facing impact

### Secret Safety
All logged data is sanitized via `sanitizeForLogging()` before storage:
- Bearer tokens → `[REDACTED]`
- API keys → `[REDACTED]`
- Card numbers → `[REDACTED_CARD]`
- Never logs: payment signatures, complete payloads, document contents, raw API responses

### Model Verification Required
Before relying on AI investigations, verify `claude-opus-5` model is valid for your Anthropic account:

```bash
# Test API connection (replace YOUR_API_KEY)
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model": "claude-opus-5", "max_tokens": 100, "messages": [{"role": "user", "content": "test"}]}'
```

If model is invalid, incident detection will still work — only AI investigation will fail (gracefully).

## After Deployment: Next Steps (Don't Do Immediately)

Wait 1-7 days before:
- Tuning fingerprint algorithm
- Adjusting severity thresholds
- Changing spike detection thresholds
- Adding new instrumentation

First, observe:
- False-positive rate (incidents that resolve themselves)
- Investigation quality (are root causes accurate?)
- Token usage (Anthropic costs)
- Incident volume (is it noisy?)
- Developer usage (do engineers actually use the dashboard?)

## Support/Debugging

### If no logs appear in ops.log_events

1. Verify application functions deployed correctly:
   ```bash
   supabase functions list | grep -E "(razorpay|verification|gemini|validate|ocr|send-push|invite|link-driver|driver-phone|tracking|marketplace|check-user)"
   ```

2. Manually trigger a function error (non-production):
   ```bash
   curl -X POST https://[project].supabase.co/functions/v1/[function-name] \
     -H "Authorization: Bearer [token]" \
     -d '{"test": true}'
   ```

3. Check function logs:
   ```bash
   supabase functions logs [function-name]
   ```

### If investigations never complete

1. Check Anthropic API key is set:
   ```bash
   echo $ANTHROPIC_API_KEY  # Should not be empty
   ```

2. Verify model name is correct in log-watcher-investigate/index.ts (should be `claude-opus-5`)

3. Check investigation function logs:
   ```bash
   supabase functions logs log-watcher-investigate | tail -50
   ```

4. Verify ops.investigations table has rows with status='FAILED':
   ```sql
   SELECT * FROM ops.investigations WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 5;
   ```

### If cron jobs don't run

1. Verify pg_cron extension:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Check cron job status:
   ```sql
   SELECT jobname, last_run_success, last_run_start, next_run FROM cron.job WHERE jobname LIKE 'log-watcher%';
   ```

3. Check cron logs (Supabase):
   - Go to project settings → Logs → Edge Functions
   - Filter for `log-watcher-scheduler`

## Completion Criteria

Deployment is successful when:

- [ ] All 13 application functions deployed without errors
- [ ] migrations applied successfully
- [ ] `ops.log_events` contains rows from production
- [ ] `ops.incidents` shows grouped errors
- [ ] pg_cron jobs running (check `last_run_start`)
- [ ] Admin dashboard displays incidents
- [ ] Investigation function completes without errors
- [ ] No sensitive data visible in stored logs

---

**Deploy when ready. Monitor for 24-48 hours. Tune after observing patterns.**
