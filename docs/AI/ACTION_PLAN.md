# DB Connection-Exhaustion Incident — Remediation Action Plan

Context: forensic investigation traced a 2026-07-14 ~06:52–07:10 UTC Postgres
connection/transaction exhaustion (recovered by a restart at 07:10:03). Internal
services (Realtime/Auth/Cron) were victims; the originating load was application
traffic through PostgREST/pooler. This plan remediates the application code paths
capable of producing that signature.

Scope note: `send-push-notifications` / `dispatch_push_notifications()` were
excluded from the audit ranking (not part of the active user surface) — no code
was changed for them. They remain deployed/cron-active in the DB.

---

## Done in this pass (code changed, NOT yet deployed)

| # | Area | File(s) | Change |
|---|------|---------|--------|
| 1 | Client retry storm (HIGH) | `contexts/OrganizationContext.tsx` | Replaced fixed 5s, uncapped, un-jittered infra-error retry (re-armed by changing `error` identity) with capped exponential backoff + ±20% jitter + max 6 attempts, keyed on a stable counter; resets on recovery and session change. |
| 10 | Realtime channel leak (MED) | `features/driver/communication/publishDriverPaymentBroadcast.ts` | Wrapped `send()` in try/finally so `removeChannel` always runs (no orphaned channel on error). |
| 6 | Public 10k-row fallback (MED) | `supabase/functions/check-user-by-phone/index.ts` | Removed `.limit(10_000)` profile-scan fallback; fail closed with 503 when the indexed RPC is unavailable. |
| 5 | Edge worker connection hold (HIGH) | `supabase/functions/verification-worker/index.ts` | Added per-external-call `AbortController` timeout (15s) to OCR/GSTIN/PAN/MCA fetches + overall worker timeout budget (50s) via `Promise.race`. |
| 8 | Invoicing fan-out (MED) | `features/invoicing/services/invoicing.service.ts` | Bounded-concurrency (5) chunking instead of unbounded `Promise.all`; await the workflow-event writes instead of detaching. |
| P1 | Background poll (LOW) | `features/trips/hooks/useTripHubInTransitPings.ts` | `refetchInterval` now gated on `useAppStateIsActive` (no polling while backgrounded). |
| FO6 | Per-name query fan-out (LOW-MED) | `features/organization/services/organization.service.ts` | `getOrganizationLocationsByNames` now one `.or(ilike...)` query + client de-dupe, instead of N concurrent `.ilike` queries. |
| 3/4 | Batch reconciliation/approval loops (HIGH) | `features/operations/control-center/hooks/useOperationsBatchActions.ts`, `features/ledger/reconciliation/useLedgerReconciliation.ts` | Added hard batch-size cap (50) to `approveSelected`/`rejectSelected`/`reconcileSelected`/`retryPosting` so an uncapped multi-select can't hold a pooled connection for an unbounded long-running mutation. |
| 7 | Chat outbox trigger (MED) | `supabase/migrations/20261203000000_chat_push_outbox_set_based_enqueue.sql` | Rewrote `fn_enqueue_chat_push_outbox()` from a per-participant INSERT+correlated-subquery loop to a single set-based `INSERT ... SELECT` (trip_id resolved once). Shortens the message-insert transaction. **Migration written, not pushed.** |

---

## Deferred (needs separate approved pass — higher risk)

| # | Item | Why deferred |
|---|------|--------------|
| 2/3 (deep) | Move per-entry vehicle-ledger posting into a single server-side transactional RPC | Requires faithfully replicating `executeVehiclePostingRuntime` idempotency + ledger-write semantics in SQL. A bug corrupts financial ledgers. The client-side batch caps above bound the connection risk in the interim; the RPC redesign should be a dedicated, well-tested change. |
| BG1 | Make `dispatch_verification_workers()` adaptive to backlog/failure rate (vs. always 5/min) | DB migration + dispatcher logic change; the worker-side timeouts (#5) already bound per-invocation hold time. |
| — | Service-role key shipped in `analytics/` browser bundle | **Security** issue (RLS bypass), out of scope for this connection-exhaustion remediation. Escalate separately. |
| — | `driverMatching.service.ts:43/122` `.eq(..., supabase().rpc(...))` | Correctness bug (unawaited builder passed as filter value), not a load path. |

---

## Deployment / verification checklist (owner action)

- [ ] `npx tsc --noEmit` / lint — client + service edits.
- [ ] Deploy edge functions: `verification-worker`, `check-user-by-phone`.
- [ ] Apply migration `20261203000000_chat_push_outbox_set_based_enqueue.sql` (`npm run db:push`) — verify chat message insert still enqueues one outbox row per eligible participant.
- [ ] Manually exercise: org load under simulated infra error (confirm backoff, not 5s lockstep); bulk invoice; batch approve/reconcile over >50 items (confirm the cap message); driver-payment settlement.
- [ ] Codex review (per repo convention).
- [ ] Confirm the earlier DB-phase next-checks (dashboard API/pooler logs for 06:40–07:10) if root-cause attribution is still needed.

No database was modified by this plan; the migration is a file only until pushed.
