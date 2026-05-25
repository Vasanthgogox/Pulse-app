# PULSE PRINCIPAL ENGINEER REVIEW
**Staff+ Architecture Document | Q-Web | 2026-05-24**

---

## PART 1 — SYSTEM RISK MAP

---

### RISK-001 — AsyncStorage Storing Operational State
**Severity: CRITICAL**

**Root cause:** `indent_draft_${orgId}`, `SALARY_REQUEST_DRAFT_KEY`, `DRIVER_ACCEPTED_TRIP_ID_KEY`, and `DRIVER_POST_MISSION_PENDING_SNAPSHOT_KEY` are stored in AsyncStorage. These are not UI preferences — they are **operational state** that drives user journeys.

**Real-world impact:** A dispatcher drafts an indent on mobile, switches to desktop, and the draft is gone. Driver accepts a trip in AsyncStorage, app crashes, storage is cleared — driver has no pending trip on restart. On web, two browser tabs can hold divergent operational state simultaneously.

**Enterprise scale:** At 500-truck operators with multiple dispatchers sharing a workspace, cross-device draft loss causes duplicate indent submissions, double assignments, and missed loads.

**Remediation:**
- All form drafts → `indents` table with `status = 'draft'`
- Driver trip state → `trip_workflow_events` + derived state
- Salary requests → transient DB rows, not localStorage
- `DRIVER_ACCEPTED_TRIP_ID_KEY` → derive from `trips` table WHERE `driver_id = me AND status IN (assigned, in_progress)`
- AsyncStorage remains valid **only** for: UI preferences (layout, theme), auth token cache (already done correctly via SecureStore first)

---

### RISK-002 — OrganizationContext Loads Once, Never Re-validates
**Severity: CRITICAL**

**Root cause:** `contexts/OrganizationContext.tsx` calls `loadOrganizationsForSession()` once at user change, stores first org, and has no subsequent validation. No polling, no realtime subscription on `organization_members`.

**Real-world impact:** Admin removes a user from an org. The removed user's app still shows full org data, can read trips, and may still successfully query (depends on RLS session caching). On Supabase, JWT tokens contain claims that are cached for the token's TTL — up to 1 hour by default.

**Enterprise scale:** A finance manager is terminated. They retain access for up to 1 hour. For freight finance with crores in transactions, this is an unacceptable window.

**Remediation:**
- Subscribe to `organization_members` realtime channel filtered by `user_id = auth.uid()`
- On DELETE event → force `signOut()` immediately
- On UPDATE where `status = 'inactive'` → same
- Validate org membership on every query (RLS handles this at DB level, but client must reflect it promptly)
- Implement `short_token_ttl` (e.g., 15 min) for enterprise plans — Supabase JWT exp configurable

---

### RISK-003 — Realtime Subscription Fan-out at Scale
**Severity: HIGH**

**Root cause:** `useRealtimeInvalidation.ts` subscribes to ALL changes on core tables org-wide (trips, transactions, messages). `realtimeRegistry.ts` caps at 20 channels with a stale sweep, but the payload volume problem is upstream.

**Real-world impact:** A 500-truck operator has 50 active trips simultaneously. Every status change on any trip broadcasts to every connected dispatcher. At 10 updates/minute across 50 trips = 500 events/minute per client. Mobile clients on 4G lose battery and bandwidth rapidly.

**Enterprise scale:** At 10,000 orgs × 5 concurrent dispatchers = 50,000 websocket connections receiving unbounded broadcasts.

**Remediation:**
- Filter realtime subscriptions: `trips` channel → `filter: organization_id=eq.${orgId}` (already partially done)
- Add a **presence-based subscription narrowing**: only subscribe to active trip IDs in current view
- Introduce a **server-side fanout buffer**: Edge Function receives `pg_notify`, debounces, sends one invalidation message per 500ms window
- Trips list view → subscribe only to `status` changes. Trip detail view → subscribe to full row
- Implement **subscription budget**: max 5 table channels per client session

---

### RISK-004 — No Distributed Idempotency for Client-Initiated Mutations
**Severity: HIGH**

**Root cause:** `trip_workflow_events` has server-side idempotency keys for workflow events. But client-initiated mutations (createTrip, createTransaction, sendTripMessage, createDirectQuote) have no idempotency enforcement. If a user taps "Create Trip" twice in 300ms (double-tap, network retry), two trips are created.

**Real-world impact:** Duplicate trips appear in dispatcher view. Duplicate transactions corrupt the ledger. Duplicate invoices sent to clients damage trust.

**Enterprise scale:** At 10,000 trips/day, even 0.1% double-submission rate = 10 phantom trips/day. Finance reconciliation becomes impossible.

**Remediation:**
- Generate a `client_idempotency_key = uuid()` at form initialization (not on submit)
- Pass key in INSERT payload; DB UNIQUE constraint on `(org_id, client_idempotency_key)` per table
- TanStack Mutation: on retry, reuse same key (don't regenerate)
- Return existing row if key collision detected (HTTP 200 with existing resource, not 409)
- Priority tables: `trips`, `transactions`, `indents`, `invoices`

---

### RISK-005 — trips.service.ts Is a 2162-Line Monolith
**Severity: HIGH**

**Root cause:** All trip logic — creation, assignment, status transitions, OTP claim, delta sync, cross-org visibility, supplier assignment, driver assignment, pagination, search — lives in one file. Single responsibility violated at scale.

**Real-world impact:** Any trip-related feature change risks regression. Two developers cannot work on trip creation and trip status FSM simultaneously without constant conflicts. Test coverage for 2162 lines requires enormous test surface.

**Enterprise scale:** Adding cargo types, AI route optimization, insurance hooks, GST e-invoicing — all must thread through this file. The blast radius of any bug is the entire trip lifecycle.

**Remediation:**
- Split into bounded sub-services:
  - `tripCreation.service.ts` — form → DB insert, OTP generation
  - `tripAssignment.service.ts` — driver/vehicle assignment, busy guards
  - `tripStatus.service.ts` — FSM transitions, event recording
  - `tripQuery.service.ts` — list, detail, delta sync, search
  - `tripCrossOrg.service.ts` — supplier/client visibility, linked-org queries
- Each sub-service has a single public interface in `features/trips/index.ts`
- Migration: extract one sub-service at a time; re-export from main file during transition

---

### RISK-006 — Missing Error Boundaries on Mission-Critical Screens
**Severity: HIGH**

**Root cause:** `FinanceScreen`, `TripDetailScreen`, and `NetworkScreen` do not have per-section React error boundaries. One RPC failure propagates to a white screen.

**Real-world impact:** A dispatcher mid-trip assignment gets a white screen because the finance widget had a data error. They cannot access the trip they were managing.

**Enterprise scale:** For ops centers managing 100 active trips, any screen failure during peak hours is a P1 incident.

**Remediation:**
- Wrap each screen section in `<ErrorBoundary fallback={<SectionError />}>`
- Finance tabs: each tab wrapped independently
- Trip detail: workflow card, documents section, chat section wrapped independently
- Log boundary catches to analytics (already have logging infrastructure)
- Never let a secondary section (analytics widget, KYC banner) crash a primary workflow surface

---

### RISK-007 — KYC Verification Status Has No State Machine Enforcement
**Severity: HIGH**

**Root cause:** `workspace_kyc_structure` migration adds `verification_status ENUM(unverified, pending, verified, rejected)` with CHECK constraints and `update_workspace_kyc` RPC. But there is no DB-level FSM enforcement — the status can transition from `verified` back to `unverified` via a direct PATCH if RLS somehow allows it.

**Real-world impact:** A verified organization's KYC status is programmatically reset. They lose access to features gated on `verified` status. Or an attacker who gains access to an admin account can self-verify.

**Remediation:**
- Add a DB trigger: `trg_kyc_transition_guard` — validates allowed transitions
  - `unverified → pending` (on submit)
  - `pending → verified` (only by super-admin service role)
  - `pending → rejected` (only by super-admin service role)
  - `rejected → pending` (re-submission allowed)
  - `verified → *` BLOCKED (verified is terminal)
- `verified_by` must be a trusted Supabase service role actor, not an app user
- Implement an internal admin Edge Function for KYC approvals

---

### RISK-008 — No Canonical Invoice Snapshot
**Severity: HIGH**

**Root cause:** `features/invoicing/invoicing.service.ts` generates PDFs dynamically from live trip data. No immutable invoice snapshot is stored. If trip data changes after invoice generation (client name correction, rate adjustment), historical invoice PDFs no longer match their source data.

**Real-world impact:** GST scrutiny requires producing the exact invoice that was issued. If the system regenerates it from mutated data, the re-generated PDF differs. This is a compliance violation.

**Enterprise scale:** 500-truck operators processing crores in freight billing across FY will face GST audits. Inability to produce original invoices is grounds for demand notices.

**Remediation:** See PART 5 — Trust & Compliance Systems

---

### RISK-009 — OrganizationContext Stores First Org — Multi-Org Not Supported
**Severity: HIGH**

**Root cause:** `loadOrganizationsForSession()` returns array, `OrganizationContext` uses `orgs[0]`. No workspace switcher exists at the context level. Users who are members of multiple orgs (e.g., finance manager across subsidiaries) have no way to switch.

**Real-world impact:** Enterprise groups with parent company + subsidiaries must create separate accounts. Platform cannot serve enterprise brokers who manage multiple fleet orgs.

**Remediation:** See PART 4 — Multi-Org Enterprise Design

---

### RISK-010 — Party Display Name Resolution in 3 Places
**Severity: MEDIUM**

**Root cause:** `chat.service.ts:resolveGenericPartyNamesForTrips()`, `chat.utils/partyDisplay.ts`, and `network/utils/partyContactDisplay.util.ts` all contain overlapping party name resolution logic.

**Real-world impact:** A driver's display name format changes in one place but not the others. Chat shows "Rajan Kumar" while network shows "R. Kumar". Inconsistent trust signals at enterprise scale undermine brand confidence.

**Remediation:** Extract canonical `lib/partyDisplay.ts` with typed inputs. All three consumers import from it. Remove duplicates.

---

### RISK-011 — Delta Sync Has No Conflict Resolution
**Severity: MEDIUM**

**Root cause:** `getTripsDelta(orgId, since)` fetches rows updated after `since`, merges into local TanStack Query cache. No conflict resolution strategy if local optimistic update conflicts with a server delta.

**Real-world impact:** Dispatcher A optimistically updates trip status to "completed." Simultaneously, dispatcher B has updated to "cancelled" on the server. Delta sync arrives — optimistic update overwrites correct server state silently.

**Remediation:**
- Delta sync should carry `updated_at` vector
- Client merge rule: server `updated_at` > local optimistic timestamp → server wins, invalidate
- Record optimistic mutations with their mutation timestamp; compare on delta arrival
- For trip status FSM: server is always authoritative. Optimistic updates for status changes must be immediately confirmed or rolled back

---

### RISK-012 — No Notification Architecture
**Severity: MEDIUM**

**Root cause:** `shared_ledger_notifications` table exists for finance events. But there is no unified notification system for: trip assignment, OTP delivery, payment received, document uploaded, bid accepted, connection request. Each feature handles its own notification ad hoc.

**Real-world impact:** A driver is assigned a trip but the push notification fails silently. No retry, no inbox, no fallback. Dispatcher assumes driver received it; driver doesn't show up.

**Remediation:** See PART 3 — Workflow Engine, notification fanout section

---

### RISK-013 — No Pagination Guard on Realtime-Invalidated Lists
**Severity: MEDIUM**

**Root cause:** When `useRealtimeInvalidation` fires, `queryClient.invalidateQueries(queryKeys.trips.all(orgId))` invalidates ALL trip pages. If dispatcher is on page 5 of trips (infinite scroll), the invalidation causes a full refetch from page 1.

**Real-world impact:** Dispatcher scrolls to find a specific old trip, realtime fires for an unrelated event, scroll position is lost as list resets to top.

**Remediation:**
- Partial invalidation: only invalidate page 1 for list-level changes (new trip, status change)
- For detail-level changes: invalidate only `queryKeys.trips.detail(tripId)`
- Use TanStack Query `updater function` for optimistic list mutations instead of full invalidation

---

### RISK-014 — `check-user-by-phone` Is the Only Edge Function
**Severity: MEDIUM**

**Root cause:** Critical operations — KYC verification, invoice generation, notification dispatch, workflow orchestration — happen either in DB triggers or client-side. Only one Edge Function exists.

**Real-world impact:** DB triggers are hard to test, hard to monitor, and run in transaction scope (a slow trigger blocks the INSERT). Client-side orchestration is untrusted and can be circumvented.

**Enterprise scale:** You cannot build a compliant, auditable enterprise system with client-controlled orchestration. Trigger-based orchestration doesn't scale past a certain complexity level.

**Remediation:** See PART 3 — Workflow Engine

---

### RISK-015 — No Subscription/Plan Enforcement at DB Level
**Severity: MEDIUM**

**Root cause:** `lib/capabilities.ts` derives capabilities from `profile.role`. There is no `subscriptions` table, no plan tier, no feature flag enforcement at DB or RLS level. All capability gates are client-side.

**Real-world impact:** A user modifies their local profile to claim `finance_manage` capability. All client-side gates are bypassed. DB RLS doesn't enforce capability-based access — only org membership.

**Remediation:**
- Add `organization_plans` table: `(org_id, plan_tier, valid_until, features: jsonb)`
- RLS policies reference plan tier for plan-gated features
- Edge Function validates plan before expensive operations (invoice PDF, AI insights)
- `getCapabilitiesFromProfile()` must be replaced by server-derived capability set

---

### RISK-016 — Missing Soft Delete / Archival Strategy
**Severity: LOW**

**Root cause:** No soft delete pattern. Clients, suppliers, drivers are deleted (or marked inactive) without archiving their historical involvement in trips/transactions.

**Real-world impact:** Deleting a supplier who fulfilled 200 trips breaks those trips' foreign key display. Finance reports show "Unknown Supplier."

**Remediation:**
- `deleted_at` column on all entity tables (clients, suppliers, drivers, vehicles)
- RLS: exclude soft-deleted records from default reads
- Archive service: move terminal records to `archived_*` tables after 2 years
- Never hard-delete any entity referenced by trips or transactions

---

## PART 2 — CANONICAL DOMAIN MODEL

---

### Ownership, Mutation Authority, Lifecycle

---

#### `organizations`
- **Source of truth:** DB (Postgres)
- **Ownership:** Created by founding member; owned by `role = 'owner'`
- **Mutable fields:** `name`, `logo_url`, `branding_settings`, `operating_model`, `status_text`
- **Immutable fields:** `id`, `created_at`, `created_by`
- **KYC fields:** `gstin`, `pan`, `cin`, `verification_status` — mutable only via `update_workspace_kyc` RPC; `verification_status` transitions via DB trigger (unverified → pending → verified/rejected)
- **Lifecycle:** `active | suspended | archived`
- **Realtime:** None required (workspace config changes are low-frequency)
- **Audit:** All KYC + branding changes → `workspace_audit_log` (trigger-enforced)
- **Archival:** Never deleted; suspended after non-payment; archived after data retention period

---

#### `org_members`
- **Source of truth:** DB
- **Ownership:** Org owner/admin controls membership
- **Mutable fields:** `role`, `status`, `capabilities`
- **Immutable fields:** `id`, `user_id`, `org_id`, `joined_at`
- **Lifecycle:** `pending → active → inactive`
- **Mutation authority:** Owner can change any role; Admin can invite/remove members; Member is read-only
- **Realtime:** Subscribe for self-removal events → force sign-out
- **Audit:** Role changes → `workspace_audit_log`

---

#### `trips`
- **Source of truth:** DB (Postgres) + `trip_workflow_events` for lifecycle state
- **Ownership:** Creating org (`organization_id`)
- **Mutable fields:** `status`, `driver_id`, `vehicle_id`, `pickup_date`, `client_price`, `supplier_rate`, `notes`
- **Immutable fields:** `id`, `trip_number`, `display_trip_id`, `created_by`, `created_at`, `organization_id`
- **Lifecycle FSM:**
  ```
  draft → assigned → in_progress → picked_up → in_transit → at_drop → completed
                                                                       ↓ cancelled (any point pre-completion)
  ```
- **FSM authority:** Status transitions validated by `updateTripStatus` — DB trigger emits `trip_workflow_events`
- **Cross-org mutations:** Suppliers can update status for trips they fulfill (scoped by RLS)
- **Realtime:** Subscribe org-wide; detail subscription for active trip
- **Audit:** Every status change → `trip_workflow_events` with actor, timestamp, payload
- **Archival:** Completed trips → read-only after 24h; archived to cold storage after 2 years

---

#### `trip_workflow_events`
- **Source of truth:** Canonical, append-only log of all trip lifecycle events
- **Ownership:** Shared (any party to the trip can append permitted events)
- **Mutable fields:** None. Immutable after INSERT.
- **Idempotency:** Single-occurrence events use deterministic `idempotency_key`; multi-occurrence events (partial payments) use NULL key
- **Lifecycle:** No lifecycle — events are permanent
- **Derivation:** `deriveWorkflowState(events)` is the ONLY way to read continuation state
- **Realtime:** Edge Function subscribes via `pg_notify`; broadcasts derived state to clients
- **Audit:** IS the audit. Every event is timestamped, actor-stamped, and immutable.
- **Archival:** Never deleted. Compacted to summary snapshots after 2 years.

---

#### `invoices`
- **Source of truth:** DB + immutable PDF snapshot in Storage
- **Ownership:** Creating org
- **Mutable fields:** None once issued. `status` can be: `draft → issued → paid → void`
- **Immutable after issue:** `invoice_number`, `amount`, `line_items`, `party_details`, `issued_at`
- **Snapshot requirement:** Issued invoice PDF stored as immutable blob; snapshot of all source data stored as JSONB column
- **Lifecycle:** `draft → issued → paid | void`
- **Realtime:** None required
- **Audit:** Issue, void events → `workspace_audit_log`; amount changes → prohibited after issue
- **GST compliance:** `irn` (Invoice Reference Number) required for e-invoicing; `hsn_codes`, `tax_breakdowns` required fields

---

#### `transactions`
- **Source of truth:** DB (double-entry ledger)
- **Ownership:** Org that records the entry
- **Mutable fields:** `description`, `notes` (within 24h of creation)
- **Immutable fields:** `amount_in`, `amount_out`, `contact_id`, `trip_id`, `created_by`, `created_at`
- **Lifecycle:** Transactions are permanent. Corrections via counter-entries (not edits).
- **Mutation authority:** Makers create; Checkers approve (for amounts > threshold) — see PART 5
- **Realtime:** Subscribe for balance updates
- **Audit:** Every transaction has `created_by`; correction transactions reference original

---

#### `pod_documents`
- **Source of truth:** Supabase Storage + DB registry row
- **Ownership:** Uploading party (driver or dispatcher)
- **Mutable fields:** `verification_status`, `notes`
- **Immutable fields:** `storage_path`, `uploaded_by`, `uploaded_at`, `trip_id`
- **Lifecycle:** `uploaded → verified | rejected`
- **Realtime:** Notify trip parties on upload
- **Audit:** Upload + verification events → `trip_workflow_events`
- **Archival:** Retained for 7 years (GST/compliance requirement)

---

#### `drivers`
- **Source of truth:** DB — Employment stint model (passbook)
- **Ownership:** Employing org
- **Mutable fields:** `status`, `commission_percent`, `payable_amount` (for active stint)
- **Immutable fields:** `hired_at`, `organization_id`, `phone` (per stint row)
- **Lifecycle:** Each row = one employment stint. `left_at IS NULL` = active. New hire = new row.
- **Mutation authority:** Org admin/owner
- **Realtime:** `driver_locations` for GPS; driver status changes
- **Audit:** Hire/terminate events → `workspace_audit_log`

---

#### `vehicles`
- **Source of truth:** DB
- **Ownership:** Org (`organization_id`)
- **Mutable fields:** `status`, `current_driver_id`, `insurance_expiry`, `permit_expiry`
- **Immutable fields:** `vehicle_number`, `type`, `created_at`
- **Lifecycle:** `active | inactive | maintenance`
- **Audit:** Document expiry events should trigger notifications

---

#### `indents` (Load Board)
- **Source of truth:** DB
- **Ownership:** Creating org (shipper)
- **Mutable fields:** `status`, `validity`, `notes`, `circulation_target`
- **Immutable fields:** `indent_number`, `origin`, `destination`, `load_type`, `created_by`, `created_at`
- **Lifecycle:** `draft → open → awarded | cancelled | expired`
- **Cross-org:** Suppliers see `open` indents matching their operating areas
- **Realtime:** Subscribe marketplace feed for new indents; bidder notifications on award/reject
- **Archival:** Terminal indents → read-only; archived after 1 year

---

#### `notifications`
- **Source of truth:** DB — unified notification table (currently absent as unified entity)
- **Required schema:**
  ```sql
  notifications(
    id, org_id, user_id,
    type: ENUM(trip_assigned, payment_received, document_uploaded, bid_received, ...),
    reference_type: ENUM(trip, transaction, indent, document, ...),
    reference_id: uuid,
    payload: jsonb,
    read_at: timestamptz,
    created_at: timestamptz
  )
  ```
- **Mutation authority:** Server only (triggers + Edge Functions)
- **Realtime:** Subscribe per user; batch mark-read via RPC
- **Archival:** Purge read notifications after 30 days; unread after 90 days

---

#### `audit_logs` (`workspace_audit_log`)
- **Source of truth:** DB — immutable append-only
- **Ownership:** System (trigger-generated or Edge Function-generated)
- **Mutable fields:** None
- **Lifecycle:** Permanent
- **Required events:** KYC change, branding change, ownership transfer, member add/remove, invoice void, maker-checker approval, role change, plan change
- **Access:** Owner/admin read-only via RPC
- **Archival:** Retain 7 years (regulatory); cold storage after 2 years

---

#### `invitations`
- **Source of truth:** DB
- **Lifecycle:** `pending → accepted | expired | revoked`
- **Types:** org_member invite, driver invite, client link invite, supplier link invite
- **Expiry:** Auto-expire via `pg_cron` after 7 days
- **Idempotency:** One pending invite per (inviting_org, invitee_identifier, type) at a time
- **Audit:** Acceptance and revocation → `workspace_audit_log`

---

#### `subscriptions` (Plan Management)
- **Source of truth:** DB (currently absent)
- **Required schema:**
  ```sql
  organization_plans(
    id, org_id,
    plan_tier: ENUM(starter, growth, enterprise, custom),
    features: jsonb,  -- feature flags for this org
    seat_limit: int,
    valid_from: timestamptz,
    valid_until: timestamptz,  -- NULL = perpetual
    status: ENUM(active, past_due, suspended, cancelled)
  )
  ```
- **Mutation authority:** Platform admin only (Edge Function with service role)
- **Capability derivation:** `getCapabilitiesFromProfile()` must query this table, not just role
- **Enforcement:** RLS policies join against this table for plan-gated features

---

### Event Relationships

```
indent.created
  → post.created (if broadcast)
    → bid.received
      → direct_quote.created
        → trip.created
          → driver.assigned → trip_workflow_events[trip.assigned]
            → driver.otp_generated (optional)
          → trip.status_changed → trip_workflow_events[trip.{status}]
          → pod.uploaded → trip_workflow_events[pod.uploaded]
          → invoice.generated → trip_workflow_events[invoice.generated]
          → payment.recorded → trip_workflow_events[supplier.payment_recorded]
          → payment.received → trip_workflow_events[client.payment_received]
            → trip_workflow_events[finance.complete] (derived)
```

### Eventual Consistency Rules

| Scenario | Source | Derived | Max Lag |
|----------|--------|---------|---------|
| Trip status → workflow state | `trip_workflow_events` INSERT | `deriveWorkflowState()` | Realtime (< 1s) |
| Invoice issued → transaction | `invoices` INSERT | `transactions` INSERT (trigger) | Synchronous |
| Indent awarded → trip linked | `direct_quotes` UPDATE | `indents.status = awarded` | Synchronous (trigger) |
| Payment recorded → balance | `transactions` INSERT | Dashboard aggregate | Query-time (< 5s) |
| Driver hired → capabilities | `organization_members` INSERT | `capabilities` | Session refresh |

---

## PART 3 — ENTERPRISE WORKFLOW ENGINE

---

### Architecture Decision: Hybrid Trigger + Edge Function Orchestration

**Rule:** DB triggers handle immediate, synchronous, data-integrity-critical side effects. Edge Functions handle async, retryable, observable orchestration.

```
Client Mutation
    ↓
Supabase DB INSERT/UPDATE
    ↓
DB Trigger (synchronous, in-transaction)
    → Validates FSM transition
    → Inserts trip_workflow_events row
    → pg_notify('workflow_channel', payload::text)
    ↓
Edge Function: workflow-orchestrator (async, subscribed to pg_notify)
    → Validates idempotency
    → Dispatches sub-jobs
    → Sends notifications
    → Broadcasts via Supabase Realtime
    → Records orchestration outcome to workflow_orchestration_log
```

---

### Event Ingestion

**Layer 1 — DB Triggers (synchronous)**
- Validate FSM transition (`BEFORE UPDATE` trigger on `trips.status`)
- Reject invalid transitions at the DB level (raise exception)
- Insert `trip_workflow_events` row (`AFTER INSERT/UPDATE` trigger)
- Fire `pg_notify('workflow_events', json_build_object('event_type', ..., 'trip_id', ..., 'org_id', ...)::text)`

**Layer 2 — Edge Function: `workflow-orchestrator`**
- Subscribes to Supabase Realtime channel (which proxies `pg_notify`)
- Alternative: `pg_cron` job polls `trip_workflow_events WHERE processed_at IS NULL` every 10s as fallback
- On event receipt: claim event with `UPDATE trip_workflow_events SET processing_started_at = now() WHERE id = $1 AND processing_started_at IS NULL` (atomic claim)

---

### Orchestration Logic (per event type)

```typescript
// workflow-orchestrator/index.ts
switch (event.event_type) {
  case 'trip.completed':
    await Promise.all([
      notifyDriver(event),
      notifyDispatcher(event),
      markContinuationReady(event),
    ]);
    break;

  case 'pod.uploaded':
    await Promise.all([
      notifyInvoiceReady(event),
      updateTripWorkflowState(event),
    ]);
    break;

  case 'invoice.generated':
    await createInvoiceSnapshot(event);
    await notifyClient(event);
    break;

  case 'payment.received':
    await reconcileFinance(event);
    await notifyFinanceManager(event);
    await checkFinanceComplete(event);
    break;
}
```

---

### Retry & Dead Letter Handling

```sql
-- Add to trip_workflow_events:
ALTER TABLE trip_workflow_events ADD COLUMN IF NOT EXISTS
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  processing_attempts int DEFAULT 0,
  processing_error text,
  dead_lettered_at timestamptz;
```

**Retry policy:**
- Attempt 1: immediate
- Attempt 2: 30s delay
- Attempt 3: 5min delay
- Attempt 4: 30min delay
- Attempt 5+: dead-letter (set `dead_lettered_at`)

**Dead letter handling:**
- `pg_cron` job: SELECT dead-lettered events → alert admin via `notifications` table
- Manual replay via internal admin Edge Function
- Dead-lettered events never block new events

---

### Replay Safety

Every orchestration action must be **idempotent**:
- `notifyDriver(event)`: `INSERT INTO notifications ... ON CONFLICT (event_id, user_id) DO NOTHING`
- `createInvoiceSnapshot(event)`: `INSERT INTO invoice_snapshots ... ON CONFLICT (invoice_id) DO NOTHING`
- `reconcileFinance(event)`: Uses `idempotency_key` on transactions table

Replay trigger: `workflow-replay` Edge Function accepts `event_id` → re-processes single event.

---

### Notification Fanout

**Unified notification pipeline:**
```
workflow-orchestrator
    ↓
notificationFanout(orgId, userId, type, referenceId, payload)
    ↓
INSERT INTO notifications (org_id, user_id, type, reference_type, reference_id, payload)
    ↓
DB trigger: pg_notify('notifications', {userId, notificationId})
    ↓
Supabase Realtime broadcast → client
    ↓
Client: useNotificationsQuery() invalidated → bell count updated
```

**Push notifications** (future): Edge Function also calls FCM/APNs API for offline users.

---

### Realtime Broadcasting

Replace ad-hoc realtime invalidations with typed broadcast messages:

```typescript
// Instead of: queryClient.invalidateQueries(queryKeys.trips.all(orgId))
// Send:
supabase.channel(`org-${orgId}`).send({
  type: 'broadcast',
  event: 'trip_status_changed',
  payload: { tripId, newStatus, updatedAt }
});

// Client handler:
channel.on('broadcast', { event: 'trip_status_changed' }, ({ payload }) => {
  queryClient.setQueryData(
    queryKeys.trips.detail(payload.tripId),
    (old) => old ? { ...old, status: payload.newStatus } : old
  );
});
```

This eliminates full-list refetches for single-entity updates.

---

### Logic Placement Rules

| Logic Type | Location | Reason |
|-----------|----------|--------|
| FSM transition validation | DB trigger (BEFORE UPDATE) | Cannot be bypassed by client |
| Event recording | DB trigger (AFTER UPDATE) | Atomic with source mutation |
| Idempotency enforcement | DB UNIQUE constraint | Cannot be bypassed by client |
| Notification dispatch | Edge Function | Async, retryable, observable |
| Invoice PDF generation | Edge Function | CPU-bound, needs external calls |
| KYC verification | Edge Function with service role | Trusted identity; no client |
| Push notification delivery | Edge Function | External API call |
| Capability derivation | Edge Function + client (for UI) | Server is authoritative |
| Realtime broadcast | Edge Function via Supabase | Single point of fan-out |
| Balance calculation | DB view / RPC | Real-time accuracy |
| Search/filter/sort | Client (TanStack Query) | Low-trust, UI-only concerns |

---

## PART 4 — MULTI-ORG ENTERPRISE DESIGN

---

### Workspace Switching

**Current state:** `OrganizationContext` holds `orgs[0]`. No switcher.

**Target state:**

```typescript
interface OrganizationContextType {
  currentOrganization: CurrentOrganization;
  availableOrganizations: OrganizationSummary[];
  switchOrganization: (orgId: string) => Promise<void>;
  isLoadingSwitch: boolean;
}
```

**`switchOrganization(orgId)` implementation:**
1. Validate membership: `SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = auth.uid() AND status = 'active'` (server-side)
2. On success: set `currentOrganization` in context
3. Cancel all in-flight queries: `queryClient.cancelQueries()`
4. Clear all org-scoped query cache: `queryClient.removeQueries({ predicate: isOrgScoped })`
5. Re-initialize realtime subscriptions for new org
6. Save selection: `SecureStore.setItem('last_org_id', orgId)` (for session restore)
7. Re-route to appropriate default tab

**Realtime namespace isolation:** Each org gets channel prefix `org-${orgId}-*`. Switching org → unsubscribe all `org-${previousOrgId}-*` channels, subscribe new set.

---

### Org Isolation Invariants

Every query, mutation, and realtime subscription **must** carry `org_id`. Violations are a security boundary breach.

**Enforcement:**
- ESLint custom rule: any Supabase query without `.eq('organization_id', orgId)` or `.eq('org_id', orgId)` triggers a lint error (unless the table is explicitly whitelisted as cross-org)
- RLS acts as second layer; the lint rule prevents logic errors that RLS wouldn't catch

---

### Cache Invalidation on Switch

```typescript
function isOrgScoped(query: Query): boolean {
  // All org-scoped queries have orgId in their key
  const key = query.queryKey;
  return typeof key[1] === 'string' && key[1] === previousOrgId;
}

queryClient.removeQueries({ predicate: isOrgScoped });
```

---

### Deep-Link Safety

Problem: Deep link arrives for `trip/[id]` — which org does this trip belong to?

**Solution:**
- All deep links include `orgId`: `/trip/${tripId}?orgId=${orgId}`
- App router intercepts deep link, calls `switchOrganization(orgId)` if needed, then navigates
- If user is not a member of the linked org → show "Access Denied" screen, not auth error

---

### Role Escalation

**Scenario:** A user is `member` in Org A (view-only) but `owner` in Org B.

- Role is **per-org-membership**, not global
- `useOrgRole()` hook reads from `org_members WHERE org_id = currentOrg.id AND user_id = auth.uid()`
- All capability derivation uses `currentOrg` + current membership role
- On org switch: `useOrgRole()` re-queries → capabilities re-derived

**No global role escalation permitted.** A user cannot use Owner capabilities from Org B while operating in Org A.

---

### Enterprise Seat Management

```sql
CREATE TABLE organization_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations NOT NULL,
  plan_tier text CHECK (plan_tier IN ('starter', 'growth', 'enterprise', 'custom')),
  seat_limit int NOT NULL DEFAULT 5,
  active_seats int GENERATED ALWAYS AS (
    SELECT COUNT(*) FROM organization_members
    WHERE organization_id = org_id AND status = 'active'
  ) STORED,
  features jsonb NOT NULL DEFAULT '{}',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  status text CHECK (status IN ('active', 'past_due', 'suspended', 'cancelled'))
);
```

**Seat enforcement:**
- `invite_org_member` RPC: checks `active_seats < seat_limit` before insert
- If over limit: returns error with upgrade prompt, not silent failure
- Owner can see seat usage in Workspace settings

---

### Org-Level Feature Flags

```sql
-- In organization_plans.features (jsonb):
{
  "ai_insights": true,
  "multi_currency": false,
  "white_label": false,
  "advanced_analytics": true,
  "api_access": false,
  "custom_workflows": false
}
```

**Client capability derivation (revised):**
```typescript
async function getCapabilitiesFromProfile(profile, orgId): Promise<Capability[]> {
  // 1. Role-based capabilities
  const roleCaps = getRoleCaps(profile.role);

  // 2. Plan feature flags (server-derived)
  const plan = await getPlanForOrg(orgId);  // Cached, short TTL
  const planCaps = derivePlanCaps(plan.features);

  // Intersection: role must have capability AND plan must enable it
  return roleCaps.filter(cap => planCaps.includes(cap));
}
```

---

### Parent Company / Subsidiary Design

```sql
CREATE TABLE organization_hierarchy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_org_id uuid REFERENCES organizations NOT NULL,
  child_org_id uuid REFERENCES organizations NOT NULL,
  relationship_type text CHECK (relationship_type IN ('subsidiary', 'department', 'franchise')),
  UNIQUE(parent_org_id, child_org_id)
);
```

**Finance manager across orgs:**
- `org_members` row in parent org with role `finance_manager`
- RLS policy on `transactions`: allows read if user is `finance_manager` in parent AND target org is child
- This is enforced server-side — client never holds cross-org data simultaneously

---

### Future White-Label Support

```sql
-- In organization_plans.features:
{ "white_label": true, "custom_domain": "freight.clientname.com" }

-- In organizations:
ALTER TABLE organizations ADD COLUMN white_label_config jsonb;
-- { "primary_color": "#1a2b3c", "logo_url": "...", "app_name": "FreightOS" }
```

---

## PART 5 — TRUST & COMPLIANCE SYSTEMS

---

### Immutable Invoice Snapshots

**The principle:** An issued invoice is a legal document. It must be reproducible identically 7 years from now.

**Schema:**
```sql
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations NOT NULL,
  trip_id uuid REFERENCES trips,
  invoice_number text NOT NULL,  -- per-org sequential
  status text CHECK (status IN ('draft', 'issued', 'paid', 'void')),

  -- Snapshot: immutable after issue
  snapshot_data jsonb,  -- Complete data at time of issue: trip, client, org, rates, taxes
  snapshot_hash text,   -- SHA-256 of canonical JSON — tamper detection
  pdf_storage_path text,  -- Path in Supabase Storage (immutable object)

  -- GST compliance
  irn text,             -- Invoice Reference Number (GST e-invoicing)
  qr_code_url text,     -- GST QR code

  issued_at timestamptz,
  issued_by uuid REFERENCES auth.users,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,

  created_at timestamptz DEFAULT now()
);

-- Immutability trigger
CREATE OR REPLACE FUNCTION trg_prevent_invoice_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'issued' AND NEW.snapshot_data IS DISTINCT FROM OLD.snapshot_data THEN
    RAISE EXCEPTION 'Issued invoice snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Generation flow (Edge Function: `generate-invoice`):**
1. Collect all trip data, client data, org branding, tax rates — at this exact moment
2. Calculate tax breakdown (CGST, SGST, IGST based on state codes)
3. Generate canonical JSON; compute SHA-256 hash
4. Render PDF from snapshot (not from live data)
5. Upload PDF to immutable Storage path: `invoices/${orgId}/${invoiceNumber}.pdf`
6. Insert `invoices` row with snapshot + hash
7. Record `trip_workflow_events[invoice.generated]`

---

### KYC Verification Lifecycle

```
unverified
    ↓ (org submits PAN + GSTIN + CIN)
pending
    ↓ (platform admin verifies documents)     ↓ (documents rejected)
verified                                    rejected
                                                ↓ (re-submission)
                                            pending
```

**Hardening:**
- `verification_status` transitions enforced by DB trigger (as described in RISK-007)
- `verified_by` must be set by service-role Edge Function only
- `verified` orgs: plan features unlocked, invoice limits raised, credit terms enabled
- `unverified` orgs: trip limit = 10, invoice generation = disabled
- KYC documents stored in private Storage bucket: `org-kyc/${orgId}/`; RLS: only service role reads

---

### GST Compliance Hardening

**Required fields on every invoice:**
- Seller GSTIN, buyer GSTIN (if registered)
- HSN/SAC codes per line item
- Tax breakdown: CGST + SGST (intra-state) or IGST (inter-state)
- Place of supply (state code)
- IRN (for e-invoicing, mandatory above ₹5 crore aggregate turnover)

**Implementation:**
- `organizations.gstin` (already exists) — validated on KYC submission
- `clients.gstin` — add to client entity
- `invoice_line_items` table — per-item breakdown with HSN code and tax rate
- State code detection: derive from GSTIN prefix (first 2 digits = state code)
- CGST/SGST vs IGST: seller state code vs buyer state code comparison

---

### Transaction Traceability

Every transaction must have:
- `created_by` (user) — already present
- `trip_id` (if trip-related) — already present
- `source_type`: `manual | auto_trigger | invoice | salary | adjustment` — add this
- `approved_by` (for amounts above maker-checker threshold)
- `correction_of` (FK to original if this is a correcting entry)

**Correction policy:** Never edit a transaction. Create a counter-entry with `correction_of = original_id` and a new transaction with the correct amount.

---

### Maker-Checker Workflows

```sql
CREATE TABLE pending_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations NOT NULL,
  approval_type text CHECK (approval_type IN ('transaction', 'invoice_void', 'driver_payout', 'expense')),
  reference_id uuid NOT NULL,
  reference_type text NOT NULL,
  requested_by uuid REFERENCES auth.users NOT NULL,
  requested_at timestamptz DEFAULT now(),
  amount numeric,  -- For threshold evaluation
  payload jsonb,
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by uuid REFERENCES auth.users,
  reviewed_at timestamptz,
  review_note text,
  expires_at timestamptz DEFAULT now() + interval '48 hours'
);
```

**Thresholds (org-configurable):**
```sql
-- In organization_plans.features:
{
  "maker_checker": {
    "enabled": true,
    "transaction_threshold": 100000,  -- ₹1 lakh
    "payout_threshold": 50000         -- ₹50k
  }
}
```

**Flow:**
1. Dispatcher creates transaction for ₹1.5 lakh
2. `createTransaction()` RPC detects amount > threshold → INSERT `pending_approvals` instead of `transactions`
3. Finance manager receives notification
4. Finance manager approves → `pending_approvals.status = approved` → trigger creates actual `transaction`
5. Audit log records both maker and checker

---

### Approval Thresholds

| Action | Threshold | Approver |
|--------|-----------|---------|
| Transaction creation | Org-configurable (default ₹1L) | Finance manager / Admin |
| Driver payout | Org-configurable (default ₹50k) | Admin |
| Invoice void | Any amount | Admin / Owner |
| Expense recording | Org-configurable | Admin |
| Rate adjustment on completed trip | Any | Owner |

---

### Support Request Flows

```sql
CREATE TABLE support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations NOT NULL,
  raised_by uuid REFERENCES auth.users NOT NULL,
  category text CHECK (category IN ('billing', 'kyc', 'technical', 'dispute', 'data_correction')),
  subject text NOT NULL,
  description text,
  reference_type text,
  reference_id uuid,
  status text CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
  priority text CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  resolution_note text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
```

---

### Field Change Requests

For immutable fields that occasionally need legitimate correction (e.g., wrong GSTIN was submitted):

```sql
CREATE TABLE field_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  entity_type text NOT NULL,  -- 'organization', 'client', 'invoice'
  entity_id uuid NOT NULL,
  field_name text NOT NULL,
  current_value text,
  requested_value text NOT NULL,
  justification text NOT NULL,
  supporting_doc_path text,
  status text CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid REFERENCES auth.users,
  reviewed_by uuid,
  created_at timestamptz DEFAULT now()
);
```

Platform admin approves; DB trigger applies the change and logs to `workspace_audit_log`.

---

### Enterprise-Grade Audit Trail

**What must be logged (minimum):**
- Every org member add/remove/role change
- Every KYC field change
- Every invoice issued/voided
- Every maker-checker approval/rejection
- Every large transaction (above threshold)
- Every capability change
- Every plan change
- Every workspace settings update

**Log format (existing `workspace_audit_log`):**
```jsonb
{
  "event_type": "invoice.voided",
  "actor_id": "uuid",
  "actor_email": "dispatcher@org.com",
  "reference_type": "invoice",
  "reference_id": "uuid",
  "before": { "status": "issued", "amount": 150000 },
  "after": { "status": "void", "void_reason": "Duplicate" },
  "ip_address": "10.x.x.x",
  "user_agent": "Mozilla/5.0..."
}
```

---

## PART 6 — EXECUTION ROADMAP

---

### 30-Day Roadmap: Enterprise Trust Foundation

**Goal:** No user should be able to corrupt data, bypass permissions, or lose work.

**Week 1 — Data Integrity Hardening**
1. `RISK-001`: Migrate indent drafts → DB `indents(status='draft')`. Remove AsyncStorage draft keys. Add draft list to indent screen.
2. `RISK-004`: Add `client_idempotency_key` to `trips`, `transactions` INSERT paths. Generate key at form init.
3. `RISK-007`: Add FSM trigger on `organizations.verification_status`. Block `verified → *` transitions.
4. Migration: Add `invoices` table with snapshot schema (schema only, no UI yet).

**Week 2 — Permission & Session Hardening**
5. `RISK-002`: Subscribe to `organization_members` realtime in `OrganizationContext`. Force sign-out on self-removal.
6. `RISK-015`: Add `organization_plans` table. Migrate existing orgs to `starter` plan. Update `getCapabilitiesFromProfile()` to server-derive.
7. Add `seat_limit` enforcement to `invite_org_member` RPC.

**Week 3 — Audit Foundation**
8. Extend `workspace_audit_log` to cover: invoice issue/void, transaction above-threshold, driver hire/terminate.
9. Add `Audit Log` tab to Workspace settings (owner/admin only).
10. Implement `createTransaction` maker-checker gate (check threshold → `pending_approvals` or direct insert).

**Week 4 — Error Boundaries & Stability**
11. `RISK-006`: Add error boundaries to FinanceScreen, TripDetailScreen, NetworkScreen.
12. `RISK-010`: Centralize party display name resolution to `lib/partyDisplay.ts`.
13. Add `notifications` table + basic in-app notification bell (count only, no push yet).

**Dependency order:** 1 → 2 → 3 (independent). 5 must precede 6. 8 must precede 10. 11-13 independent.
**Rollback safety:** All changes are additive (new columns, new tables, new triggers). No breaking schema changes.

---

### 60-Day Roadmap: Workflow Engine & Multi-Org

**Goal:** Move orchestration server-side. Support multiple orgs per user.

**Week 5-6 — Workflow Engine**
14. Add `processing_*` columns to `trip_workflow_events`.
15. Build `workflow-orchestrator` Edge Function (event consumer, notification dispatch, retry logic).
16. Replace client-side `pg_notify` listeners with Edge Function orchestration.
17. Build `generate-invoice` Edge Function with immutable snapshot creation.

**Week 7-8 — Multi-Org Support**
18. `RISK-009`: Update `OrganizationContext` to expose `availableOrganizations` + `switchOrganization()`.
19. Build org switcher UI (workspace menu in header/profile tab).
20. Implement org-switch cache invalidation + realtime resubscription.
21. Add `organization_hierarchy` table. Build parent/subsidiary model.
22. Deep-link safety: all navigation links include `orgId` param.

**Dependency order:** 14 must precede 15. 15 must precede 16. 17 independent of 15. 18-22 sequential.
**Migration risk:** `switchOrganization()` changes session semantics — test thoroughly in staging. Edge Function deployment is atomic and rollback-safe.

---

### 90-Day Roadmap: Compliance, Scale & AI Readiness

**Goal:** Platform is trustworthy for 500-truck operators with GST scrutiny and crores in freight billing.

**Week 9-10 — GST Compliance**
23. Add GST fields to `clients` (GSTIN, state code).
24. Build `invoice_line_items` table with HSN codes.
25. Implement CGST/SGST vs IGST logic in invoice Edge Function.
26. IRN integration stub (e-invoicing gateway placeholder for future).

**Week 11-12 — Realtime Scaling**
27. `RISK-003`: Implement typed broadcast messages for realtime instead of full-list invalidation.
28. Add presence-based subscription narrowing (active trip IDs in view).
29. `RISK-013`: Fix pagination preservation on realtime invalidation.
30. Realtime health dashboard in internal admin panel.

**Week 13 — trips.service.ts Decomposition**
31. `RISK-005`: Extract `tripCreation.service.ts`, `tripAssignment.service.ts`, `tripStatus.service.ts`, `tripQuery.service.ts`.
32. Re-export from `features/trips/index.ts` — no consumer changes required.
33. Add unit tests per sub-service.

**Architecture checkpoints:**
- Day 30: Audit log coverage ≥ 80% of critical mutations. Zero AsyncStorage operational state.
- Day 60: Workflow engine handles 100% of invoice generation. Multi-org switch works correctly.
- Day 90: GST compliance fields complete. Realtime subscription budget enforced. No monolithic service files > 500 lines.

**Staffing assumptions:** 2 senior backend engineers (migrations + Edge Functions), 1 senior frontend engineer (multi-org UI + realtime), 1 QA engineer (regression testing). Staff+ Architect reviews all schema migrations before merge.

---

## PART 7 — ENGINEERING CONSTITUTION

---

### I. ARCHITECTURAL LAWS

**LAW-01: One entity, one canonical surface.**
No concept may have two screens, two data sources, or two mutation paths. If duplication is found, one must be a redirect shim pointing to the canonical.

**LAW-02: AsyncStorage is cache-only, never authoritative.**
Operational state (drafts, trip state, approval status, capabilities) must never be stored in AsyncStorage. AsyncStorage may hold: UI preferences, auth token cache (SecureStore first), last-visited route.

**LAW-03: Every mutation must be: org-scoped, role-checked, idempotent, auditable.**
No INSERT/UPDATE/DELETE reaches the DB without: confirmed `org_id`, confirmed `role` (RLS), client idempotency key, and an audit log entry for regulated entities.

**LAW-04: The DB is the source of truth. The client is a view.**
No client-held state is authoritative. Delta sync and realtime subscriptions keep the view fresh. Conflicts always resolve to server state.

**LAW-05: Triggers handle integrity. Edge Functions handle orchestration.**
DB triggers enforce FSM transitions and immutability. Edge Functions handle async workflows, external calls, and notification fanout. Client handles UI state only.

**LAW-06: Immutable events are the audit trail.**
`trip_workflow_events`, `workspace_audit_log`, and `invoice_snapshots` are append-only and immutable. No `UPDATE` or `DELETE` is permitted on these tables. This is enforced by DB trigger and RLS policy (no `DELETE` granted to any role).

**LAW-07: Cross-org data access is always explicit, never implicit.**
A query that reads data across org boundaries must explicitly declare the cross-org relationship (via `linked_organization_id`, `organization_hierarchy`, or a named RPC). No wildcard org access.

---

### II. FORBIDDEN PATTERNS

**FORBIDDEN-01:** `AsyncStorage.setItem(key, JSON.stringify(operationalData))`
— AsyncStorage for anything except preferences or cached auth tokens.

**FORBIDDEN-02:** Hardcoded route strings.
— All routes via `ROUTES.*` from `lib/routes.ts`.

**FORBIDDEN-03:** Inline query keys.
— All cache keys via `queryKeys.*` factory.

**FORBIDDEN-04:** Direct `supabase().from('table').select()` in React components.
— All Supabase calls in `features/[domain]/services/*.service.ts` only.

**FORBIDDEN-05:** `UPDATE invoices SET snapshot_data = ...` after `status = 'issued'`.
— Issued invoice snapshots are immutable. Correction requires void + new invoice.

**FORBIDDEN-06:** Client-side capability derivation from profile.role alone.
— Capabilities must be server-derived (plan tier + role + org membership).

**FORBIDDEN-07:** Realtime subscription without unsubscribe cleanup.
— Every `subscribeSharedPostgresChanges()` call must return and call its unsubscribe in useEffect cleanup.

**FORBIDDEN-08:** RLS-bypassing RPCs without explicit security context.
— All `SECURITY DEFINER` functions must have `SET search_path = public` and explicit authz check as first statement.

**FORBIDDEN-09:** Org-scoped queries without `eq('organization_id', orgId)`.
— All org-scoped table queries must include explicit org filter. RLS is the safety net, not the primary filter.

**FORBIDDEN-10:** `service_role` key in application code.
— Service role is used exclusively in Edge Functions for trusted orchestration.

---

### III. CANONICAL NAVIGATION PRINCIPLES

1. **Modal vs Full Page decision matrix:**
   - Modal: single-action workflows (create trip, add transaction, invite member)
   - Full page: multi-step workflows, detail views, settings pages
   - Sheet (bottom): contextual actions on an existing entity (trip actions, load share)

2. **Tab routing:** `ROUTES.TABS.*` only. No programmatic navigation to tab sub-routes from non-tab contexts.

3. **Deep links:** All deep links include `orgId` param. Router validates org membership before navigation.

4. **Back navigation:** Never `router.push()` where `router.replace()` is correct (auth flows, post-action returns).

5. **Navigation fragments:** A feature must not create its own navigation stack. All stacks flow from `app/_layout.tsx`.

---

### IV. CANONICAL STATE MANAGEMENT RULES

1. **Server state:** TanStack Query only. No useState for data fetched from Supabase.
2. **Global UI state:** React Context only (`AuthContext`, `OrganizationContext`, `LanguageContext`, `NetworkContext`). No Zustand, no Redux.
3. **Local UI state:** useState/useReducer within the component or feature hook.
4. **Forms:** React Hook Form (or equivalent) — never useState per field.
5. **Optimistic updates:** Only via TanStack Mutation `onMutate` + `onError` rollback. Never via direct cache writes outside mutation handlers.
6. **Cache invalidation:** Via `queryClient.invalidateQueries(queryKeys.X.Y(params))` only. Never via `queryClient.clear()`.

---

### V. REALTIME RULES

1. Subscribe only to tables and events the current view actually needs.
2. Always use `subscribeSharedPostgresChanges()` — never `supabase().channel()` directly in components.
3. Budget: max 5 active realtime channels per client session.
4. All realtime event handlers must be idempotent (duplicate events possible).
5. Realtime is an invalidation signal, not a data transport — always re-fetch after invalidation.
6. Exception: `driver_locations` may use realtime as data transport (lat/lng updates are not worth refetching via query).

---

### VI. EVENT NAMING CONVENTIONS

Format: `{domain}.{action}` — lowercase, dot-separated.

```
trip.created
trip.assigned
trip.status_changed
trip.completed
trip.cancelled
pod.uploaded
pod.verified
invoice.generated
invoice.voided
payment.recorded
payment.received
driver.hired
driver.terminated
member.invited
member.removed
kyc.submitted
kyc.verified
kyc.rejected
indent.created
indent.awarded
bid.received
bid.accepted
```

**Never use:** past-tense forms that differ from the above (e.g., `tripCompleted`, `trip_completed` — use `trip.completed`). This applies to `trip_workflow_events.event_type`, `workspace_audit_log.event_type`, and notification `type` columns.

---

### VII. AUDIT REQUIREMENTS

Every entity mutation that affects money, identity, or access must produce an audit record before the mutation completes. The audit record must contain:

```typescript
{
  event_type: string;        // canonical event name
  actor_id: string;          // auth.uid()
  actor_role: string;        // role at time of action
  org_id: string;            // org context
  reference_type: string;    // entity type
  reference_id: string;      // entity id
  before: object | null;     // previous state (null for creates)
  after: object | null;      // new state (null for deletes)
  timestamp: ISO8601;        // server timestamp
  ip_address?: string;       // for Edge Function-initiated actions
}
```

**Audit is NOT optional for:** invoice issue/void, transaction create/correct, member role change, KYC field change, plan change, driver hire/terminate.

---

### VIII. MUTATION SAFETY CHECKLIST

Before merging any PR that introduces a new mutation:

- [ ] Mutation is org-scoped (`organization_id` enforced in INSERT/UPDATE)
- [ ] Mutation validates role via RLS or explicit `useOrgRole()` gate
- [ ] Mutation has client idempotency key (for user-initiated) or server idempotency key (for system-initiated)
- [ ] Mutation has a rollback path (optimistic update has `onError` handler)
- [ ] Mutation produces an audit record (for regulated entities)
- [ ] Mutation is covered by a DB UNIQUE constraint where applicable
- [ ] No operational state written to AsyncStorage
- [ ] Realtime invalidation is scoped (not org-wide unless truly necessary)
- [ ] The screen calling this mutation has an error boundary

---

*This document supersedes all prior architectural guidance. Conflicts between this document and existing patterns are resolved in favor of this document. All new features must be reviewed against this constitution before implementation.*

---

**Document Version:** 1.0 | **Authors:** Principal Systems Architecture Review | **Status:** Authoritative
