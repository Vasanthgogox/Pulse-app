# PULSE — PRINCIPAL ENGINEER EXECUTION PLAN
**Production Implementation Document | Pulse | 2026-05-24**
**Status: AUTHORITATIVE — supersedes all prior planning docs**

---

## PART 1 — PRIORITIZED EXECUTION ROADMAP

---

### P0 — MUST FIX BEFORE SCALE
*These are live production risks. Each can cause data corruption, security breach, or loss of operator trust at any current scale.*

---

#### P0-001: AsyncStorage Operational State → DB Migration

**Why it matters:** `DRIVER_ACCEPTED_TRIP_ID_KEY`, `indent_draft_${orgId}`, `SALARY_REQUEST_DRAFT_KEY`, `DRIVER_POST_MISSION_PENDING_SNAPSHOT_KEY` are AsyncStorage keys that drive actual trip operations. A device wipe, tab close, or app reinstall silently loses operational state. A driver app crash during an active trip can leave the driver with no way to find their assigned trip without re-searching.

**Blast radius:** Every driver on every active trip. Every dispatcher with in-progress indent drafts. Data loss is silent — no error thrown.

**Complexity:** Medium. Requires: DB schema additions (draft status on indents, derive active trip from DB query), client changes in 4–6 files, removal of AsyncStorage writes.

**Migration risk:** Low. Additive only. Old clients reading stale AsyncStorage keys fail gracefully (no key found → query DB instead).

**Backend/Frontend:** Both (DB: add `status='draft'` to indents; Frontend: remove AsyncStorage writes, derive from query).

**Rollback:** Feature-flagged. If new draft query fails, fallback to AsyncStorage read for 1 release cycle. Remove fallback in next release.

**Exact files to change:**
- `features/indents/services/indents.service.ts` — remove draft AsyncStorage write, add `createDraftIndent()` DB call
- `features/drivers/hooks/useDriverMission.ts` — replace `DRIVER_ACCEPTED_TRIP_ID_KEY` with `useActiveDriverTripQuery(driverId)`
- `lib/queries/useActiveDriverTripQuery.ts` — new: `SELECT * FROM trips WHERE driver_id = $1 AND status IN ('assigned','in_progress','picked_up','in_transit','at_drop') LIMIT 1`
- `features/drivers/services/salary.service.ts` — replace `SALARY_REQUEST_DRAFT_KEY` with DB-backed draft salary request row

---

#### P0-002: OrganizationContext Membership Revocation

**Why it matters:** A terminated dispatcher retains full org access until their JWT expires (up to 1 hour). They can read all trips, transactions, driver data, and client contacts during that window. No client-side guard detects removal.

**Blast radius:** Any org that terminates a member. In a 500-truck operator with 10 dispatchers, the probability of needing immediate revocation is high (employee departure, security incident, role change).

**Complexity:** Low. 20 lines in `OrganizationContext.tsx`. One realtime subscription added.

**Migration risk:** None. Purely additive. No schema change.

**Backend/Frontend:** Frontend only.

**Rollback:** Remove the `useEffect` subscription. Zero risk.

**Exact change — `contexts/OrganizationContext.tsx`:**
```typescript
// Add inside loadOrganizationsForSession(), after currentOrg is set:
const channel = supabase()
  .channel(`membership-self-${user.id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'organization_members',
    filter: `user_id=eq.${user.id}`,
  }, (payload) => {
    if (payload.eventType === 'DELETE') {
      signOut();
    }
    if (payload.eventType === 'UPDATE' && payload.new.status === 'inactive') {
      signOut();
    }
  })
  .subscribe();

return () => supabase().removeChannel(channel);
```

---

#### P0-003: Client-Initiated Mutation Idempotency

**Why it matters:** `createTrip`, `createTransaction`, `createDirectQuote` have no idempotency protection. TanStack Query retries mutations on network failure. Double-tap on mobile on a laggy connection creates two trips. Two identical transactions from one form submission corrupts the ledger.

**Blast radius:** Finance integrity. Every dispatcher on every mutation. Silent — no error shown.

**Complexity:** Medium. DB: add `client_idempotency_key uuid` column + UNIQUE constraint to 4 tables. Client: generate UUID at form mount, pass in payload, reuse on retry.

**Migration risk:** Low. New nullable column, backfilled NULL for existing rows. UNIQUE constraint is partial (`WHERE client_idempotency_key IS NOT NULL`).

**Backend/Frontend:** Both.

**Rollback:** Drop the column. Remove client-side key generation. Zero risk since column is nullable.

**Migration file (exact):**
```sql
-- 20260525_idempotency_keys.sql
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS client_idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_idempotency
  ON trips(organization_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS client_idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency
  ON transactions(organization_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

ALTER TABLE indents
  ADD COLUMN IF NOT EXISTS client_idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_indents_idempotency
  ON indents(organization_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;
```

**Client pattern (exact):**
```typescript
// In form component mount:
const idempotencyKey = useRef(crypto.randomUUID());

// In mutation call:
await createTrip({ ...formData, clientIdempotencyKey: idempotencyKey.current });

// Service layer: pass to INSERT; on UNIQUE violation, SELECT and return existing row
```

---

#### P0-004: KYC FSM DB Enforcement

**Why it matters:** `verification_status` can be mutated to any value by anyone with UPDATE permission on `organizations`. A `verified` org can self-reset to `unverified` (losing gated features) or an admin account compromise allows self-verification.

**Blast radius:** All KYC-gated features. Financial trust signals. Compliance liability.

**Complexity:** Low. One DB trigger. No client changes.

**Migration risk:** None. Trigger is BEFORE UPDATE — rejects invalid transitions with exception.

**Backend only.**

**Rollback:** Drop trigger. 1-line rollback.

**Exact trigger:**
```sql
-- 20260526_kyc_fsm_guard.sql
CREATE OR REPLACE FUNCTION fn_guard_kyc_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.verification_status = NEW.verification_status THEN
    RETURN NEW; -- no change, allow
  END IF;

  IF OLD.verification_status = 'verified' THEN
    RAISE EXCEPTION 'KYC: verified status is terminal and cannot be changed';
  END IF;

  IF OLD.verification_status = 'unverified' AND NEW.verification_status NOT IN ('pending') THEN
    RAISE EXCEPTION 'KYC: unverified can only transition to pending';
  END IF;

  IF OLD.verification_status = 'pending' AND NEW.verification_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'KYC: pending can only transition to verified or rejected';
  END IF;

  IF OLD.verification_status = 'rejected' AND NEW.verification_status NOT IN ('pending') THEN
    RAISE EXCEPTION 'KYC: rejected can only re-submit to pending';
  END IF;

  -- Only service role can set verified
  IF NEW.verification_status = 'verified' AND current_setting('role') != 'service_role' THEN
    RAISE EXCEPTION 'KYC: only platform can mark as verified';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_kyc_transition_guard
  BEFORE UPDATE OF verification_status ON organizations
  FOR EACH ROW EXECUTE FUNCTION fn_guard_kyc_transition();
```

---

#### P0-005: Error Boundaries on Mission-Critical Screens

**Why it matters:** A single null-pointer in a finance widget crashes the entire FinanceScreen. A broken realtime subscription tears down TripDetailScreen. These are P1 incidents for dispatchers mid-operation.

**Blast radius:** All dispatchers on all screens during any data error.

**Complexity:** Low. Existing React error boundary pattern. 3–4 components to wrap.

**Migration risk:** None. Error boundaries are opt-in wrappers.

**Frontend only.**

**Rollback:** Remove wrappers. Zero risk.

**Exact wrapping targets:**
```typescript
// app/(tabs)/finance.tsx — wrap each tab
<ErrorBoundary fallback={<FinanceTabError tab="ledger" />}>
  <LedgerTab />
</ErrorBoundary>

// features/trips/components/TripDetailScreen.tsx
<ErrorBoundary fallback={<SectionError section="workflow" />}>
  <TripContinuationCard />
</ErrorBoundary>
<ErrorBoundary fallback={<SectionError section="documents" />}>
  <TripDocuments />
</ErrorBoundary>
<ErrorBoundary fallback={<SectionError section="chat" />}>
  <TripChat />
</ErrorBoundary>
```

---

### P1 — MUST FIX BEFORE ENTERPRISE ROLLOUT

---

#### P1-001: Invoice Snapshot Immutability

**Why it matters:** Currently invoices are re-rendered from live trip data on every PDF view. If the trip rate changes after invoice issue, the regenerated PDF differs from what was sent to the client. This is a GST compliance violation — original invoice must be reproducible verbatim.

**Blast radius:** All invoicing workflows. Any GST audit for any org.

**Complexity:** High. Requires: new `invoices` table with snapshot schema, new Edge Function `generate-invoice`, migration of existing invoice generation flow.

**Migration risk:** Medium. Dual-write period required (old flow + new snapshot flow simultaneously). Old PDF links remain valid.

**Backend + Edge Function + Frontend.**

**Rollback:** Keep old invoice generation path behind feature flag. Remove new path flag if issues.

---

#### P1-002: Unified Notification Architecture

**Why it matters:** Trip assignment, bid acceptance, payment receipt — all generate notifications ad hoc in different feature modules. No retry, no inbox, no delivery guarantee. A driver assigned a trip may never know if the push fails.

**Blast radius:** Driver reliability for every trip assignment. Finance alert delivery for every payment.

**Complexity:** High. New DB table, Edge Function orchestration, in-app bell, read tracking.

**Migration risk:** Low (additive). Existing flows continue unchanged; notification system layers on top.

**Backend + Edge Function + Frontend.**

**Rollback:** Feature-flagged. Existing notification paths continue independently.

---

#### P1-003: Organization Plans + Server-Derived Capabilities

**Why it matters:** All capability gates are client-side. `getCapabilitiesFromProfile()` reads `profile.role` only. No plan tier enforcement. Any user can claim capabilities by modifying local state.

**Blast radius:** All feature gates. Finance, marketplace, AI features — all bypassable.

**Complexity:** Medium. New `organization_plans` table. Revised `getCapabilitiesFromProfile()` with server RPC. RLS policies updated.

**Migration risk:** Low. Migrate all current orgs to `starter` plan with equivalent capabilities. No regression for existing users.

**Backend + Frontend.**

**Rollback:** Revert capability derivation to role-only. Feature-flagged per org.

---

#### P1-004: Multi-Org Workspace Switching

**Why it matters:** `OrganizationContext` stores `orgs[0]`. Enterprise brokers managing multiple orgs (parent + subsidiaries) must create separate accounts. This blocks the enterprise segment entirely.

**Blast radius:** 100% of multi-org enterprise customers. Platform ceiling.

**Complexity:** High. Context refactor, cache invalidation on switch, realtime resubscription, org switcher UI, deep-link safety with `orgId` param.

**Migration risk:** Medium. Context API change affects all consumers. Requires careful audit of all `useOrganization()` call sites (likely 30–50 files).

**Frontend + Backend (validation RPC).**

**Rollback:** Revert `OrganizationContext` to single-org mode. Feature-flagged by plan tier.

---

#### P1-005: trips.service.ts Decomposition

**Why it matters:** At 2162 LOC, any change to trip creation can break trip status transitions. Two engineers cannot parallelize work on the trips domain. Test coverage is impractical.

**Blast radius:** Every trips-related feature. Every sprint touching trips.

**Complexity:** High, but zero production risk if done correctly (anti-corruption layer pattern). Pure refactor — no DB changes, no API changes.

**Migration risk:** Low if done with compatibility adapter. Medium if done naively.

**Frontend (service layer).**

**Rollback:** Revert to monolith imports. Git revert of extraction PR.

---

#### P1-006: Delta Sync Conflict Resolution

**Why it matters:** `getTripsDelta()` merges server rows into local cache without checking if there is a newer optimistic update in flight. Dispatcher B's server-confirmed status change can be silently overwritten by Dispatcher A's stale optimistic state.

**Blast radius:** Any org with multiple concurrent dispatchers. Status corruption on shared trips.

**Complexity:** Medium. Requires timestamped optimistic mutations + merge strategy in delta sync.

**Migration risk:** Low. Changes in `useTripsQuery.ts` and service layer only.

**Frontend.**

**Rollback:** Remove conflict resolution logic. Return to current merge behavior.

---

### P2 — POST-STABILIZATION

---

#### P2-001: Realtime Typed Broadcasts (replace full invalidation)

Replace `queryClient.invalidateQueries(queryKeys.trips.all(orgId))` with typed broadcast messages per entity. Eliminates full-list refetch on single entity change. Required before 10k orgs.

**Complexity:** High. **Migration risk:** Medium. **Rollback:** Revert to invalidation strategy.

---

#### P2-002: Soft Delete + Archival Strategy

Add `deleted_at` to clients, suppliers, vehicles. Prevent FK display breakage. Required before any org exceeds ~500 historical trips referencing archived entities.

**Complexity:** Medium. **Migration risk:** Low. **Rollback:** Drop column.

---

#### P2-003: Maker-Checker Workflows

`pending_approvals` table + approval gate in `createTransaction` for amounts above org-configured threshold. Required for enterprise finance accounts.

**Complexity:** High. **Migration risk:** Low (additive). **Rollback:** Feature-flagged per org.

---

#### P2-004: GST Compliance Fields

GSTIN on clients, `invoice_line_items` table, HSN codes, CGST/SGST/IGST logic in invoice Edge Function, IRN stub.

**Complexity:** High. **Migration risk:** Low (additive schema). **Rollback:** Feature-flagged.

---

#### P2-005: Pagination Preservation on Realtime Invalidation

Invalidate only page 1 (not all pages) on list-level realtime events. Fix infinite scroll reset on unrelated realtime fires.

**Complexity:** Low. **Migration risk:** None. **Rollback:** Revert invalidation scope.

---

## PART 2 — SAFE DATABASE MIGRATION PLAN

---

### Guiding Principles

1. **Expand/Contract pattern:** Every migration adds columns/tables first (expand), then application code uses them, then old columns/tables are dropped (contract) in a separate, later migration.
2. **No column drops in the same migration as column adds.** Always a separate deployment.
3. **Feature flags gate new behavior.** Old clients (< 1 version behind) must not break.
4. **All migrations are zero-downtime.** No `ALTER TABLE ... SET NOT NULL` without default. No table locks on large tables.
5. **Rollback = always DROP the new artifact** (column, index, trigger, table). Never restore old state by reverse-mutation.

---

### Migration 1: Idempotency Keys
**File:** `20260525_001_idempotency_keys.sql`
**Phase:** Expand only. No behavior change.

```sql
-- Safe: nullable column, no lock
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS client_idempotency_key uuid;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS client_idempotency_key uuid;

ALTER TABLE indents
  ADD COLUMN IF NOT EXISTS client_idempotency_key uuid;

-- Safe: partial unique index, concurrent build
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_client_idempotency
  ON trips(organization_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_client_idempotency
  ON transactions(organization_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_indents_client_idempotency
  ON indents(organization_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;
```

**App deploy after migration:** Client begins sending `client_idempotency_key` in new requests. Old clients (no key) continue to work (column is NULL). Conflict returns existing row.

**Rollback:**
```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_trips_client_idempotency;
ALTER TABLE trips DROP COLUMN IF EXISTS client_idempotency_key;
-- Repeat for transactions, indents
```

---

### Migration 2: KYC FSM Trigger
**File:** `20260525_002_kyc_fsm_trigger.sql`
**Phase:** Atomic. Trigger enforce only. No schema change.

```sql
CREATE OR REPLACE FUNCTION fn_guard_kyc_transition() ... (see P0-004 above)
CREATE TRIGGER trg_kyc_transition_guard BEFORE UPDATE OF verification_status ON organizations ...
```

**Pre-deploy validation:** Run a query to confirm no orgs are in an invalid state that the trigger would reject on their next update:
```sql
SELECT id, verification_status FROM organizations
WHERE verification_status NOT IN ('unverified','pending','verified','rejected');
-- Must return 0 rows.
```

**Rollback:**
```sql
DROP TRIGGER IF EXISTS trg_kyc_transition_guard ON organizations;
DROP FUNCTION IF EXISTS fn_guard_kyc_transition();
```

---

### Migration 3: Invoice Snapshots (Expand Phase)
**File:** `20260526_001_invoices_table.sql`
**Phase:** Expand. New table only. No existing table changes.

```sql
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  trip_id uuid REFERENCES trips(id),
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','paid','void')),
  snapshot_data jsonb,
  snapshot_hash text,
  pdf_storage_path text,
  irn text,
  qr_code_url text,
  issued_at timestamptz,
  issued_by uuid REFERENCES auth.users(id),
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id),
  void_reason text,
  client_idempotency_key uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_org_number
  ON invoices(org_id, invoice_number);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_idempotency
  ON invoices(org_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

-- Immutability trigger
CREATE OR REPLACE FUNCTION fn_guard_invoice_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'issued' AND (
    NEW.snapshot_data IS DISTINCT FROM OLD.snapshot_data OR
    NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash OR
    NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
    NEW.issued_at IS DISTINCT FROM OLD.issued_at
  ) THEN
    RAISE EXCEPTION 'invoice.snapshot_immutable: issued invoice fields are read-only';
  END IF;
  -- void is allowed only by setting status, void_reason, voided_at, voided_by
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_invoice_snapshot
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_guard_invoice_snapshot();

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_org_select ON invoices
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY invoices_org_insert ON invoices
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('owner','admin','member')
    )
  );

CREATE POLICY invoices_org_update ON invoices
  FOR UPDATE USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('owner','admin')
    )
  );
-- No DELETE policy — invoices are never deleted
```

**App deploy (dual-write phase):** New invoice generation writes to both old flow (dynamic PDF) AND new `invoices` table. Feature-flagged per org. Old clients continue using dynamic PDF. New clients use snapshot PDF.

**Contract phase** (future migration, after all clients on new flow): Mark dynamic PDF generation as deprecated. Remove old code path.

**Rollback:**
```sql
DROP TRIGGER IF EXISTS trg_guard_invoice_snapshot ON invoices;
DROP FUNCTION IF EXISTS fn_guard_invoice_snapshot();
DROP TABLE IF EXISTS invoices;
```

---

### Migration 4: Organization Plans
**File:** `20260527_001_organization_plans.sql`
**Phase:** Expand. Seed all existing orgs to `starter`.

```sql
CREATE TABLE IF NOT EXISTS organization_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
  plan_tier text NOT NULL DEFAULT 'starter'
    CHECK (plan_tier IN ('starter','growth','enterprise','custom')),
  seat_limit int NOT NULL DEFAULT 10,
  features jsonb NOT NULL DEFAULT '{
    "ai_insights": false,
    "multi_currency": false,
    "white_label": false,
    "advanced_analytics": false,
    "api_access": false,
    "maker_checker": {"enabled": false, "transaction_threshold": 100000}
  }',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','past_due','suspended','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed all existing orgs to starter plan
INSERT INTO organization_plans (org_id, plan_tier)
SELECT id, 'starter' FROM organizations
ON CONFLICT (org_id) DO NOTHING;

-- RLS: org members can read their own plan
ALTER TABLE organization_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_plans_select ON organization_plans
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
-- No INSERT/UPDATE/DELETE for app users — managed by service role only
```

**App deploy:** Add `getPlanForOrg(orgId)` RPC. Update `getCapabilitiesFromProfile()` to also check plan features. Feature-flag the plan check — old behavior (role-only) continues if plan check fails gracefully.

**Rollback:** `DROP TABLE organization_plans;` — app falls back to role-only capabilities.

---

### Migration 5: Notifications Table
**File:** `20260528_001_notifications.sql`
**Phase:** Expand. New table only.

```sql
CREATE TYPE notification_type AS ENUM (
  'trip.assigned', 'trip.status_changed', 'trip.completed',
  'payment.received', 'payment.recorded',
  'pod.uploaded', 'pod.verified',
  'invoice.generated', 'invoice.voided',
  'bid.received', 'bid.accepted',
  'indent.awarded',
  'member.invited', 'member.removed',
  'kyc.status_changed',
  'approval.requested', 'approval.resolved'
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  type notification_type NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb DEFAULT '{}',
  read_at timestamptz,
  actioned_at timestamptz,
  delivery_channel text[] DEFAULT ARRAY['in_app'],  -- 'in_app', 'push', 'email'
  push_delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_org
  ON notifications(org_id, created_at DESC);

-- Idempotency: prevent duplicate notifications for same event + user
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_idempotency
  ON notifications(user_id, type, reference_id)
  WHERE created_at > now() - interval '24 hours';

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_self_select ON notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notifications_self_update ON notifications
  FOR UPDATE USING (user_id = auth.uid());
-- INSERT is service-role only (Edge Function)
```

**Rollback:** `DROP TABLE notifications; DROP TYPE notification_type;`

---

### Migration 6: Workflow Events Processing Columns
**File:** `20260529_001_workflow_events_processing.sql`
**Phase:** Expand. Additive columns only.

```sql
ALTER TABLE trip_workflow_events
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_events_unprocessed
  ON trip_workflow_events(created_at ASC)
  WHERE processing_completed_at IS NULL AND dead_lettered_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_events_dead_letter
  ON trip_workflow_events(dead_lettered_at DESC)
  WHERE dead_lettered_at IS NOT NULL;
```

**Rollback:** Drop indexes, `ALTER TABLE trip_workflow_events DROP COLUMN ...` for each added column.

---

### Migration 7: Org Membership Realtime Revocation (no schema change needed)
Only application-layer change in `OrganizationContext.tsx`. No migration required. See P0-002.

---

### Feature Flag Rollout Order

```
Week 1:  client_idempotency_key enforcement (per-org flag: 'idempotency_v2')
Week 2:  kyc_fsm_trigger (global, no flag needed — safe default)
Week 3:  org_plans table + capability server-derivation (per-org flag: 'server_caps_v1')
Week 4:  invoices table + dual-write (per-org flag: 'invoice_snapshot_v1')
Week 5:  notifications table + Edge Function (per-org flag: 'unified_notifications_v1')
Week 6:  workflow orchestrator (per-org flag: 'workflow_orchestrator_v1')
```

---

## PART 3 — TRIPS DOMAIN REFACTOR PLAN

---

### Current State

`features/trips/services/trips.service.ts` — ~2162 LOC containing:
- Trip creation + OTP generation
- Driver/vehicle assignment (incl. busy guards, RPC calls)
- Status FSM transitions
- List queries (org, client, supplier, driver views)
- Detail queries
- Delta sync logic
- Search/filter
- Cross-org visibility queries
- Direct quote → trip conversion
- Trip finance helpers

This is 8 distinct responsibilities in one file.

---

### Target Folder Structure

```
features/trips/
├── services/
│   ├── tripCreation.service.ts       # createTrip, createFromDirectQuote, generateOTP, claimByOTP
│   ├── tripAssignment.service.ts     # assignDriver, assignVehicle, unassign, busy guards
│   ├── tripStatus.service.ts         # updateTripStatus, FSM validation, event recording
│   ├── tripQuery.service.ts          # list, detail, byDriver, byClient, bySupplier
│   ├── tripSync.service.ts           # getDelta, mergeDelta, syncWithCache
│   ├── tripCrossOrg.service.ts       # getTripsWhereOrgIsClient, getTripsWhereOrgIsSupplier
│   ├── tripFinance.service.ts        # finance helpers, adjustments, rate queries
│   └── trips.service.ts             # RE-EXPORT ONLY — backward compatibility shim
├── hooks/
│   └── (existing)
├── components/
│   └── (existing)
└── index.ts                          # Public API — re-exports from all sub-services
```

---

### Extraction Order (CRITICAL — follow this exactly)

**Phase 0 — Preparation (no extraction yet)**
1. Add comprehensive unit tests to `trips.service.ts` covering all exported functions (measure current test coverage baseline).
2. Add TypeScript return type annotations to every exported function (untyped returns make extraction unsafe).
3. Run `grep -r "from.*trips.service" --include="*.ts" --include="*.tsx" .` — catalog all import sites.

**Phase 1 — Extract `tripQuery.service.ts` (lowest coupling)**

These functions have no side effects, only DB reads. Safest to extract first.

Move:
- `getTripsByOrganization()`
- `getTripsWhereOrgIsClient()`
- `getTripsWhereOrgIsSupplier()`
- `getTripDetail()`
- `getTripsByDriver()`
- `searchTrips()`

In `trips.service.ts` after move:
```typescript
// Anti-corruption shim — remove in Phase 5
export {
  getTripsByOrganization,
  getTripsWhereOrgIsClient,
  getTripsByDriver,
} from './tripQuery.service';
```

All existing consumers continue to import from `trips.service.ts` — zero import changes required during this phase.

**Phase 2 — Extract `tripSync.service.ts`**

Move:
- `getTripsDelta()`
- `mergeDeltaIntoCache()` (if exists as function)
- `syncTripsWithCache()`

These depend on `tripQuery.service.ts` (already extracted). Import from there, not from old monolith.

**Phase 3 — Extract `tripCreation.service.ts`**

Move:
- `createTrip()`
- `createTripFromDirectQuote()`
- `generateTripOTP()`
- `claimTripByOTP()`

These may call query functions — import from `tripQuery.service.ts`.

**Phase 4 — Extract `tripAssignment.service.ts`**

Move:
- `assignDriver()`
- `assignVehicle()`
- `unassignDriver()`
- RPC wrappers: `assign_aggregate_trip_driver`

**Phase 5 — Extract `tripStatus.service.ts`**

Move:
- `updateTripStatus()`
- Status validation helpers
- `recordTripWorkflowEvent()` calls (import from `features/trips/services/tripWorkflow.service.ts`)

**Phase 6 — Extract `tripCrossOrg.service.ts` and `tripFinance.service.ts`**

Move remaining helpers.

**Phase 7 — Clean `trips.service.ts` to pure re-export**

```typescript
// trips.service.ts — SHIM ONLY, do not add logic here
export * from './tripCreation.service';
export * from './tripAssignment.service';
export * from './tripStatus.service';
export * from './tripQuery.service';
export * from './tripSync.service';
export * from './tripCrossOrg.service';
export * from './tripFinance.service';
```

**Phase 8 — Migrate import sites**

Run codemod to replace `from '@/features/trips/services/trips.service'` with specific sub-service imports. Optional — the shim handles this indefinitely.

---

### Anti-Corruption Layer

The shim in `trips.service.ts` IS the anti-corruption layer. It ensures:
- All existing consumers continue to work with zero changes
- New code imports from specific sub-services (enforced by ESLint rule)
- Circular dependencies are impossible (sub-services don't import from the shim)

**ESLint rule to add:**
```javascript
// eslint.config.cjs — add rule:
'no-restricted-imports': ['error', {
  paths: [{
    name: '@/features/trips/services/trips.service',
    message: 'Import from specific sub-service instead: tripQuery.service, tripCreation.service, etc.',
  }]
}]
```
Exception: The shim file itself is exempt. New files must import from sub-services.

---

### Circular Dependency Prevention

Dependency direction must be strictly:

```
tripCreation  →  tripQuery  (allowed: creation may read for validation)
tripAssignment → tripQuery  (allowed: assignment may check existing driver)
tripStatus    →  tripQuery  (allowed: status may validate current state)
tripStatus    →  tripWorkflow (allowed: record events)
tripSync      →  tripQuery  (allowed: sync fetches via query)
tripFinance   →  tripQuery  (allowed: finance reads trip data)
tripCrossOrg  →  tripQuery  (allowed: builds on base queries)

FORBIDDEN:
tripQuery → tripCreation  (read layer must not import write layer)
tripQuery → tripStatus
tripWorkflow → tripStatus  (workflow is downstream, not upstream)
```

Enforce with `eslint-plugin-import` `import/no-cycle`.

---

### Test Strategy During Extraction

1. **Before Phase 1:** Capture integration test suite output (all tests passing baseline).
2. **After each phase:** Run full test suite. Zero regressions required to proceed to next phase.
3. **Per extracted file:** Add unit tests for each moved function before moving it. Test the function in isolation (mock Supabase client).
4. **Regression measurement:** Track test count per phase. If any test fails post-extraction, revert that phase's extraction (git revert the specific move).
5. **End-to-end:** Run Playwright trip creation → assignment → status change flow after Phase 7.

---

### How to Measure Regression Risk

| Metric | Safe Threshold | Action if Exceeded |
|--------|---------------|-------------------|
| Unit test coverage on extracted file | ≥ 80% before move | Do not extract until covered |
| Import sites broken after extraction | 0 | Revert extraction |
| TypeScript errors after extraction | 0 | Fix before merge |
| E2E trip flows passing after each phase | 100% | Block phase completion |
| Build time regression | < 5% | Acceptable |

---

## PART 4 — ENTERPRISE REALTIME STRATEGY

---

### Channel Namespace Strategy

Every Supabase Realtime channel must follow this naming convention:

```
org-{orgId}-trips          # Org-scoped trip changes
org-{orgId}-finance        # Org-scoped transaction changes
org-{orgId}-notifications  # User notifications (further filtered client-side by user_id)
org-{orgId}-presence       # Online dispatcher presence
trip-{tripId}-detail       # Single-trip full-fidelity channel (only when trip detail is open)
driver-{driverId}-location # Single-driver GPS (only when tracking is active)
marketplace-{orgId}        # Indent/bid market feed
```

**Rules:**
- Prefix always starts with entity type and orgId
- No global channels (no `trips-all`, `notifications-all`)
- `driver-{id}-location` channels are created only when the tracking map is mounted and torn down immediately on unmount
- `trip-{id}-detail` channels are created only when TripDetailScreen is mounted

---

### Subscription Budget Enforcement

Each client session may maintain a maximum of **6 active realtime channels**:

| Slot | Channel | Condition |
|------|---------|-----------|
| 1 | `org-{orgId}-trips` | Always active while dispatcher tab is open |
| 2 | `org-{orgId}-finance` | Only when Finance tab is mounted |
| 3 | `org-{orgId}-notifications` | Always active (logged in) |
| 4 | `trip-{tripId}-detail` | Only when a specific trip detail is open |
| 5 | `driver-{id}-location` | Only when tracking map is open |
| 6 | `marketplace-{orgId}` | Only when marketplace/indent feed is open |

**Enforcement in `realtimeRegistry.ts`:**
```typescript
const CHANNEL_BUDGET = 6;

// Already exists: channel cap check
// Extend: log which slot is being used and reject if over budget
if (activeChannelCount >= CHANNEL_BUDGET) {
  console.warn(`[RealtimeRegistry] Budget exceeded. Active: ${activeChannelCount}`);
  // Do NOT subscribe. Return a no-op unsubscribe.
  return () => {};
}
```

---

### Fan-out Reduction

**Problem:** A trip status change broadcasts to every dispatcher in the org, even if they're looking at a different screen.

**Solution — Typed broadcast instead of postgres_changes:**

```typescript
// Edge Function: workflow-orchestrator sends typed broadcast
// after processing a trip_workflow_events row:
await supabase
  .channel(`org-${orgId}-trips`)
  .send({
    type: 'broadcast',
    event: 'trip.status_changed',
    payload: {
      tripId,
      newStatus,
      updatedAt,
      actorId,
    },
  });

// Client: channel handler does surgical cache update
orgTripsChannel.on('broadcast', { event: 'trip.status_changed' }, ({ payload }) => {
  // Only update the specific trip in cache — no full refetch
  queryClient.setQueryData(
    queryKeys.trips.detail(payload.tripId),
    (old: TripDetail | undefined) =>
      old ? { ...old, status: payload.newStatus, updatedAt: payload.updatedAt } : old
  );

  // Invalidate list only if status is a list-visible change (e.g., completed or cancelled)
  if (['completed', 'cancelled'].includes(payload.newStatus)) {
    queryClient.invalidateQueries(queryKeys.trips.list(currentOrgId));
  }
});
```

This eliminates full-list refetches for mid-lifecycle status changes.

---

### Debounce / Invalidation Aggregation

For high-frequency events (chat messages, location updates, marketplace bids), aggregate invalidations:

```typescript
// In realtimeRegistry or useRealtimeInvalidation:
const pendingInvalidations = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedInvalidate(key: string, invalidateFn: () => void, debounceMs = 500) {
  if (pendingInvalidations.has(key)) {
    clearTimeout(pendingInvalidations.get(key)!);
  }
  pendingInvalidations.set(key, setTimeout(() => {
    invalidateFn();
    pendingInvalidations.delete(key);
  }, debounceMs));
}

// Usage in chat message handler:
debouncedInvalidate(
  `chat-${tripId}`,
  () => queryClient.invalidateQueries(queryKeys.chat.messages(tripId)),
  300
);
```

**Debounce budgets by event type:**
- Trip status changes: 0ms (immediate — critical)
- Chat messages: 300ms (tolerable lag)
- Finance transactions: 500ms (not latency-sensitive in list view)
- Location updates: 0ms (but direct cache write, not query invalidation)
- Marketplace bids: 1000ms (aggregate multiple bids before refresh)

---

### Presence Strategy

Use Supabase Presence on `org-{orgId}-presence` to show online dispatchers:

```typescript
const presenceChannel = supabase.channel(`org-${orgId}-presence`);

presenceChannel.on('presence', { event: 'sync' }, () => {
  const state = presenceChannel.presenceState();
  const onlineUserIds = Object.values(state).flat().map((p: any) => p.userId);
  setOnlineDispatchers(onlineUserIds);
});

presenceChannel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    await presenceChannel.track({ userId: currentUser.id, joinedAt: Date.now() });
  }
});
```

**Use cases:**
- Show "online" badge on org member list
- Show which dispatcher last touched a trip
- Future: collaborative editing conflict detection

**Do NOT use presence for:** delivery guarantees, session management, or auth signals. Presence is UI-only.

---

### Reconnect Handling

Already partially handled by `supabase.ts` (exponential backoff 250ms–30s). Extend:

```typescript
// In realtimeRegistry.ts — add reconnect handler:
channel.on('system', {}, (status) => {
  if (status === 'CHANNEL_ERROR') {
    // Mark channel as degraded in health metrics
    telemetry.capBreaches++;
  }
  if (status === 'CLOSED') {
    // Attempt re-subscribe after grace period
    setTimeout(() => resubscribe(key), gracePeriodMs);
  }
});
```

On reconnect: fire a full query invalidation for all active query keys (data may have changed during disconnect). This is a one-time cost paid for reconnect safety.

---

### Offline Recovery

When `NetworkContext` detects connectivity restored:

```typescript
// In useNetworkRecovery.ts (new hook):
useEffect(() => {
  if (!isConnected) return;

  // Re-subscribe all realtime channels
  realtimeRegistry.reconnectAll();

  // Invalidate all queries (data may be stale from offline period)
  queryClient.invalidateQueries();

  // Run delta sync for trips and transactions
  if (orgId) {
    refetchTripsDelta(lastSyncTimestamp);
    refetchTransactionsDelta(lastSyncTimestamp);
  }
}, [isConnected]);
```

**Offline write queue** (future P2): Queue mutations made offline in a `pending_mutations` table (IndexedDB or AsyncStorage — acceptable for queue, not for truth). On reconnect, replay with idempotency keys. Failed replays surface as error notifications.

---

### Backpressure Handling

If a client receives > 20 realtime events/second:

```typescript
// In realtimeRegistry.ts:
const EVENT_RATE_LIMIT = 20; // events per second
let eventCount = 0;
let rateLimitWindow = Date.now();

function handleIncomingEvent(callback: () => void) {
  const now = Date.now();
  if (now - rateLimitWindow > 1000) {
    eventCount = 0;
    rateLimitWindow = now;
  }
  eventCount++;
  if (eventCount > EVENT_RATE_LIMIT) {
    // Drop event — schedule a full invalidation instead
    scheduleFullRefresh();
    return;
  }
  callback();
}
```

If rate exceeded, schedule one full query invalidation 1s later (covers all missed events).

---

### Battery Optimization (Mobile)

```typescript
// In app/_layout.tsx or NetworkContext:
import { AppState } from 'react-native';

AppState.addEventListener('change', (state) => {
  if (state === 'background') {
    // Pause non-critical realtime channels
    realtimeRegistry.pauseChannels(['org-trips', 'marketplace', 'org-finance']);
    // Keep only: notifications channel (for push fallback awareness)
  }
  if (state === 'active') {
    // Resume channels + do full invalidation
    realtimeRegistry.resumeChannels();
    queryClient.invalidateQueries();
  }
});
```

**Additional mobile optimizations:**
- Location channel: subscribe only when map view is visible, unsubscribe on map unmount
- Marketplace channel: unsubscribe when app backgrounds for > 5 minutes
- All channels: reduce heartbeat from 30s to 60s when on cellular (check `NetInfo.type === 'cellular'`)

---

## PART 5 — NOTIFICATION SYSTEM DESIGN

---

### DB Schema

See Migration 5 above. Additionally:

```sql
-- Notification preferences (user-level)
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  org_id uuid NOT NULL REFERENCES organizations(id),
  -- Per-type channel preferences
  preferences jsonb NOT NULL DEFAULT '{
    "trip.assigned":        {"in_app": true, "push": true,  "email": false},
    "payment.received":     {"in_app": true, "push": true,  "email": true},
    "pod.uploaded":         {"in_app": true, "push": false, "email": false},
    "invoice.generated":    {"in_app": true, "push": false, "email": true},
    "bid.received":         {"in_app": true, "push": true,  "email": false},
    "member.invited":       {"in_app": true, "push": false, "email": true},
    "approval.requested":   {"in_app": true, "push": true,  "email": true}
  }',
  push_token text,  -- FCM/APNs device token
  push_token_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Push delivery log (for retry tracking)
CREATE TABLE notification_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id),
  channel text NOT NULL CHECK (channel IN ('in_app','push','email')),
  attempt_number smallint NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('pending','delivered','failed','dead_lettered')),
  provider_response jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  error_message text
);

CREATE INDEX ON notification_delivery_log(notification_id, channel);
CREATE INDEX ON notification_delivery_log(status, attempted_at)
  WHERE status IN ('pending','failed');
```

---

### Edge Function: `notification-dispatcher`

**Trigger:** Subscribes to `notifications` table INSERT via Supabase Realtime (or pg_notify from insert trigger).

```typescript
// supabase/functions/notification-dispatcher/index.ts

Deno.serve(async (req) => {
  const event = await req.json(); // { notification_id }
  const notification = await getNotification(event.notification_id);
  const prefs = await getUserPreferences(notification.user_id, notification.org_id);

  const channels = getEnabledChannels(prefs, notification.type);

  await Promise.allSettled(
    channels.map(channel => deliverToChannel(notification, channel))
  );
});

async function deliverToChannel(notification: Notification, channel: string) {
  const logId = await createDeliveryLog(notification.id, channel);
  try {
    if (channel === 'push') await sendPushNotification(notification);
    if (channel === 'email') await sendEmailNotification(notification);
    // in_app: already in DB, realtime handles delivery
    await markDelivered(logId);
  } catch (err) {
    await markFailed(logId, err.message);
    await scheduleRetry(notification.id, channel, currentAttempt + 1);
  }
}
```

---

### Retry / Dead Letter

**Retry schedule (in `notification_delivery_log`):**

```sql
-- pg_cron job: every 2 minutes, retry failed deliveries
SELECT cron.schedule(
  'retry-failed-notifications',
  '*/2 * * * *',
  $$
  SELECT notification_id, channel
  FROM notification_delivery_log
  WHERE status = 'failed'
    AND attempt_number < 5
    AND attempted_at < now() - (attempt_number * interval '30 seconds')
  ORDER BY attempted_at ASC
  LIMIT 50;
  -- Pass each to notification-dispatcher Edge Function
  $$
);
```

After attempt 5 → `status = 'dead_lettered'`. Dead-lettered notifications alert on-call via internal admin notification.

---

### Idempotency

The `notifications` table has a unique index:
```sql
CREATE UNIQUE INDEX idx_notifications_idempotency
  ON notifications(user_id, type, reference_id)
  WHERE created_at > now() - interval '24 hours';
```

Insertion uses `ON CONFLICT DO NOTHING`. A workflow event that fires twice (replay) will not create duplicate notifications.

---

### Read Models (Unread Counters)

```typescript
// lib/queries/useNotificationsQuery.ts

// Unread count — cheap query, lightweight
export function useUnreadNotificationCount(userId: string) {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(userId),
    queryFn: async () => {
      const { count } = await supabase()
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);
      return count ?? 0;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

// Full inbox — paginated
export function useNotificationsInbox(userId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.inbox(userId),
    queryFn: async ({ pageParam = 0 }) => {
      const { data } = await supabase()
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + 19);
      return data ?? [];
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < 20 ? undefined : pages.length * 20,
  });
}
```

**Realtime for unread counter:**
Subscribe to `notifications` table INSERT filtered by `user_id=eq.${userId}` → on new notification: `queryClient.invalidateQueries(queryKeys.notifications.unreadCount(userId))`.

---

### Role-Aware Delivery

Notification routing determined by event type + actor role:

| Event | Recipients |
|-------|-----------|
| `trip.assigned` | driver (push), assigning dispatcher (in_app) |
| `payment.received` | finance manager (push + email), owner (in_app) |
| `invoice.generated` | owner (in_app), finance manager (in_app) |
| `bid.received` | indent creator (push + in_app) |
| `member.invited` | invitee (email), inviting admin (in_app confirmation) |
| `approval.requested` | all admins/owners in org (push + in_app) |
| `kyc.status_changed` | owner (push + email) |

Role resolution in Edge Function: query `organization_members` filtered by role to build recipient list.

---

## PART 6 — OBSERVABILITY & INCIDENT RESPONSE

---

### Metrics to Capture

**Application metrics (client-side, send to analytics):**
```typescript
// lib/analytics.ts — extend existing or create
interface OperationalMetric {
  event: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

// Capture:
trackMetric('realtime.channel_count', activeChannelCount, { orgId });
trackMetric('realtime.event_rate', eventsPerSecond, { channel });
trackMetric('query.cache_hit_rate', hitRate, { queryKey });
trackMetric('mutation.latency_ms', latencyMs, { mutationType });
trackMetric('auth.restore_duration_ms', durationMs, {});
trackMetric('delta_sync.rows_merged', rowCount, { table });
trackMetric('error_boundary.triggered', 1, { screen, section });
```

**DB metrics (Supabase built-in + custom):**
- `pg_stat_statements` → slow queries > 500ms
- `pg_stat_replication` → replication lag
- Dead letter queue depth: `SELECT COUNT(*) FROM trip_workflow_events WHERE dead_lettered_at IS NOT NULL`
- Unprocessed workflow events: `SELECT COUNT(*) FROM trip_workflow_events WHERE processing_completed_at IS NULL AND created_at < now() - interval '2 minutes'`

---

### SLOs

| SLO | Target | Measurement |
|-----|--------|-------------|
| Trip status update → realtime delivery | < 2s P99 | Timestamp in event vs client receipt |
| Invoice PDF generation | < 10s P95 | Edge Function duration |
| Auth restore (cold start) | < 3s P90 | `auth.restore_duration_ms` metric |
| Query cache hit rate | > 70% | TanStack Query devtools / analytics |
| Notification delivery (push) | < 30s P95 | `notification_delivery_log` timestamps |
| Workflow event processing | < 5s P99 | `processing_completed_at - created_at` |
| DB query latency | < 200ms P95 | `pg_stat_statements` |
| Realtime reconnect time | < 10s P99 | `system` event timestamps |

---

### Alerting Thresholds

**Page immediately (P1 incident):**
- Dead letter queue depth > 10 events
- Workflow events unprocessed for > 5 minutes
- Auth error rate > 5% over 5-minute window
- DB connection pool > 90% utilized
- Edge Function error rate > 10% over 2 minutes
- Realtime channel `CHANNEL_ERROR` rate > 5 per minute

**Warning (Slack alert, no page):**
- Dead letter queue depth > 3
- Workflow processing lag P99 > 10s
- Query latency P95 > 500ms
- Realtime event rate per client > 15/s
- Cache hit rate < 60%
- Notification delivery failures > 3 consecutive for any user

**No alert (dashboard only):**
- Active realtime channel count
- Delta sync frequency
- Form abandonment rate
- Session restore duration

---

### Workflow Lag Detection

```sql
-- View for monitoring (refresh via pg_cron every minute):
CREATE VIEW workflow_lag_monitor AS
SELECT
  event_type,
  COUNT(*) FILTER (WHERE processing_completed_at IS NULL AND dead_lettered_at IS NULL) AS unprocessed,
  COUNT(*) FILTER (WHERE dead_lettered_at IS NOT NULL) AS dead_lettered,
  AVG(EXTRACT(EPOCH FROM (processing_completed_at - created_at))) FILTER (
    WHERE processing_completed_at IS NOT NULL
  ) AS avg_processing_seconds,
  MAX(EXTRACT(EPOCH FROM (now() - created_at))) FILTER (
    WHERE processing_completed_at IS NULL AND dead_lettered_at IS NULL
  ) AS max_lag_seconds
FROM trip_workflow_events
WHERE created_at > now() - interval '1 hour'
GROUP BY event_type;
```

Alert if `max_lag_seconds > 300` (5 minutes).

---

### Audit Visibility

Internal admin panel query (Edge Function with service role):
```sql
SELECT
  wal.event_type,
  wal.actor_id,
  p.full_name AS actor_name,
  wal.reference_type,
  wal.reference_id,
  wal.payload,
  wal.created_at
FROM workspace_audit_log wal
LEFT JOIN profiles p ON p.id = wal.actor_id
WHERE wal.org_id = $1
ORDER BY wal.created_at DESC
LIMIT 100;
```

Org owners/admins access their own audit log via the Workspace → Audit Log tab.

---

### Dead Letter Monitoring

```sql
-- pg_cron: run every 15 minutes
SELECT cron.schedule(
  'alert-dead-letters',
  '*/15 * * * *',
  $$
  DO $$
  DECLARE dead_count int;
  BEGIN
    SELECT COUNT(*) INTO dead_count
    FROM trip_workflow_events
    WHERE dead_lettered_at IS NOT NULL
      AND dead_lettered_at > now() - interval '1 hour';

    IF dead_count > 0 THEN
      INSERT INTO notifications (org_id, user_id, type, reference_type, reference_id, title, body)
      SELECT
        'PLATFORM_ADMIN_ORG_ID',  -- internal platform org
        'PLATFORM_ADMIN_USER_ID',
        'system.dead_letter_alert',
        'workflow_events',
        gen_random_uuid(),
        'Dead Letter Alert',
        dead_count || ' workflow events dead-lettered in last hour';
    END IF;
  END;
  $$ LANGUAGE plpgsql;
  $$
);
```

---

### Feature Flag Kill Switches

Each major feature has a kill switch in `organization_plans.features`:

```jsonb
{
  "kill_switches": {
    "realtime_trips": false,        // if true: disable trips realtime, use polling
    "invoice_generation": false,    // if true: disable PDF generation
    "workflow_orchestrator": false, // if true: disable Edge Function orchestration
    "notifications": false,         // if true: disable notification dispatch
    "marketplace": false            // if true: hide marketplace tab
  }
}
```

Client checks kill switch before mounting realtime subscriptions or triggering Edge Functions. Any kill switch can be activated per-org in < 1 minute via internal admin panel without a deployment.

---

### Crash Analytics Strategy

Extend existing `ErrorBoundary` catches:

```typescript
// components/ErrorBoundary.tsx
componentDidCatch(error: Error, info: ErrorInfo) {
  // Already logs to console
  // Add:
  analytics.track('error_boundary.crash', {
    error: error.message,
    stack: error.stack?.substring(0, 500),
    componentStack: info.componentStack?.substring(0, 500),
    screen: this.props.screen,
    section: this.props.section,
    orgId: getCurrentOrgId(),
    userId: getCurrentUserId(),
  });
}
```

On native: integrate `expo-application` for version tracking. Group crashes by `(screen, section, appVersion)`.

---

## PART 7 — ENTERPRISE TRUST & COMPLIANCE

---

### Immutable Invoice Generation (Complete Flow)

**Edge Function: `generate-invoice`**

```typescript
// supabase/functions/generate-invoice/index.ts
Deno.serve(async (req) => {
  const { tripId, orgId, actorId, clientIdempotencyKey } = await req.json();

  // 1. Auth check — actor must be admin/owner of org
  const actor = await verifyActor(actorId, orgId, ['admin', 'owner']);
  if (!actor) return new Response('Forbidden', { status: 403 });

  // 2. Idempotency check
  const existing = await supabaseAdmin
    .from('invoices')
    .select('id, pdf_storage_path, status')
    .eq('trip_id', tripId)
    .eq('org_id', orgId)
    .single();
  if (existing.data) {
    return Response.json({ invoiceId: existing.data.id, alreadyExists: true });
  }

  // 3. Collect snapshot data AT THIS MOMENT
  const [trip, org, client, branding] = await Promise.all([
    getTripWithAllRelations(tripId),
    getOrgWithKYC(orgId),
    getClientForTrip(tripId),
    getBrandingSettings(orgId),
  ]);

  const snapshotData = {
    trip: sanitizeTrip(trip),
    organization: sanitizeOrg(org),
    client: sanitizeClient(client),
    branding: sanitizeBranding(branding),
    taxCalculation: calculateTax(trip, org, client),
    generatedAt: new Date().toISOString(),
    generatedBy: actorId,
    platformVersion: Deno.env.get('PLATFORM_VERSION'),
  };

  // 4. Compute tamper-evident hash
  const canonicalJson = JSON.stringify(snapshotData, Object.keys(snapshotData).sort());
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson));
  const snapshotHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // 5. Generate invoice number (per-org sequential via RPC)
  const invoiceNumber = await generateInvoiceNumber(orgId);

  // 6. Render PDF from snapshot (not live data)
  const pdfBytes = await renderInvoicePDF(snapshotData, invoiceNumber);

  // 7. Upload to immutable storage path
  const storagePath = `invoices/${orgId}/${invoiceNumber}.pdf`;
  await supabaseAdmin.storage
    .from('invoices')
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: false,  // NEVER overwrite
    });

  // 8. Insert invoice row (immutability trigger guards future UPDATEs)
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .insert({
      org_id: orgId,
      trip_id: tripId,
      invoice_number: invoiceNumber,
      status: 'issued',
      snapshot_data: snapshotData,
      snapshot_hash: snapshotHash,
      pdf_storage_path: storagePath,
      issued_at: new Date().toISOString(),
      issued_by: actorId,
      client_idempotency_key: clientIdempotencyKey,
    })
    .select()
    .single();

  // 9. Record workflow event
  await supabaseAdmin.from('trip_workflow_events').insert({
    trip_id: tripId,
    org_id: orgId,
    actor_id: actorId,
    event_type: 'invoice.generated',
    payload: { invoice_id: invoice.id, invoice_number: invoiceNumber },
    idempotency_key: `invoice.generated:${tripId}`,
  });

  // 10. Audit log
  await supabaseAdmin.from('workspace_audit_log').insert({
    org_id: orgId,
    event_type: 'invoice.generated',
    actor_id: actorId,
    reference_type: 'invoice',
    reference_id: invoice.id,
    before: null,
    after: { invoice_number: invoiceNumber, trip_id: tripId, amount: trip.client_price },
  });

  return Response.json({ invoiceId: invoice.id, invoiceNumber });
});
```

---

### GST Audit Safety

**Tax calculation (server-side, in Edge Function):**
```typescript
function calculateTax(trip: Trip, org: Org, client: Client) {
  const sellerStateCode = org.gstin?.substring(0, 2);
  const buyerStateCode = client.gstin?.substring(0, 2);
  const isInterState = sellerStateCode && buyerStateCode && sellerStateCode !== buyerStateCode;

  const baseAmount = trip.client_price;
  const gstRate = 0.18; // 18% GST for freight (SAC: 9965)
  const gstAmount = baseAmount * gstRate;

  return {
    sac_code: '9965',
    base_amount: baseAmount,
    gst_rate: gstRate,
    ...(isInterState
      ? { igst: gstAmount, cgst: 0, sgst: 0 }
      : { igst: 0, cgst: gstAmount / 2, sgst: gstAmount / 2 }),
    total_tax: gstAmount,
    total_amount: baseAmount + gstAmount,
    place_of_supply: sellerStateCode,
    is_inter_state: isInterState,
  };
}
```

**Audit reproducibility:** The `snapshot_hash` allows auditors to verify that the PDF produced today matches the original data. Hash is computed from canonical JSON (keys sorted) before PDF render. Any mutation to snapshot_data after issue → DB trigger exception.

---

### KYC Approval Chain

**Three actors, strictly separated:**
1. **Org owner/admin:** submits KYC fields → status: `unverified → pending`
2. **Platform internal admin:** reviews submitted documents → status: `pending → verified | rejected`
3. **DB trigger:** enforces that transition rules are never violated

**Platform admin Edge Function: `admin-verify-kyc`** (service role only):
```typescript
Deno.serve(async (req) => {
  // Validate caller is platform admin (custom JWT claim or hardcoded admin user list)
  const { orgId, decision, rejectionReason, adminId } = await req.json();

  const newStatus = decision === 'approve' ? 'verified' : 'rejected';

  await supabaseAdmin.from('organizations').update({
    verification_status: newStatus,
    verified_by: decision === 'approve' ? adminId : null,
    verified_at: decision === 'approve' ? new Date().toISOString() : null,
    kyc_rejected_reason: decision === 'reject' ? rejectionReason : null,
  }).eq('id', orgId);

  // Audit log
  await supabaseAdmin.from('workspace_audit_log').insert({
    org_id: orgId,
    event_type: `kyc.${newStatus}`,
    actor_id: adminId,
    reference_type: 'organization',
    reference_id: orgId,
    before: { verification_status: 'pending' },
    after: { verification_status: newStatus, reason: rejectionReason },
  });
});
```

---

### Financial Traceability

Every `transactions` row must be traceable to its origin:

```sql
-- Add source tracking to transactions:
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source_type text
    CHECK (source_type IN ('manual','invoice','salary','adjustment','correction','system')),
  ADD COLUMN IF NOT EXISTS source_reference_id uuid,  -- invoice_id, salary_request_id, etc.
  ADD COLUMN IF NOT EXISTS correction_of uuid REFERENCES transactions(id),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Correction policy: never UPDATE amount. Create counter-entry:
-- Original: amount_in = 50000, source_type = 'manual'
-- Correction: amount_out = 50000, source_type = 'correction', correction_of = original.id
-- New entry: amount_in = 45000, source_type = 'manual'
```

**Traceability query (for audit):**
```sql
WITH RECURSIVE correction_chain AS (
  SELECT id, amount_in, amount_out, correction_of, source_type, created_by, created_at
  FROM transactions WHERE id = $1
  UNION ALL
  SELECT t.id, t.amount_in, t.amount_out, t.correction_of, t.source_type, t.created_by, t.created_at
  FROM transactions t
  JOIN correction_chain c ON t.id = c.correction_of
)
SELECT * FROM correction_chain ORDER BY created_at;
```

---

### Void vs Delete Semantics

**Universal rule: nothing financial is ever hard-deleted.**

| Entity | Soft action | Hard delete allowed? |
|--------|------------|---------------------|
| `invoices` | `status = 'void'` + `voided_at` + `voided_by` | Never |
| `transactions` | Correction entry with `correction_of` FK | Never |
| `trip_workflow_events` | No action (events are permanent) | Never |
| `workspace_audit_log` | No action (immutable) | Never |
| `indents` | `status = 'cancelled'` | Never |
| `trips` | `status = 'cancelled'` | Never |
| `clients` | `deleted_at` timestamp (soft) | Never while referenced by trip |
| `drivers` | `left_at` timestamp (stint end) | Never |
| `organization_members` | `status = 'inactive'` | Never |

**RLS enforcement for void (never delete):**
```sql
-- No DELETE policy exists on invoices, transactions, trip_workflow_events, workspace_audit_log
-- This means even the service role (via RLS) cannot delete — requires bypassing RLS which is never done in app code
```

---

### Tamper-Evident Audit Logs

```sql
-- workspace_audit_log: append-only enforced by trigger
CREATE OR REPLACE FUNCTION fn_prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'audit_log.immutable: audit records cannot be modified or deleted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_log_immutability
  BEFORE UPDATE OR DELETE ON workspace_audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_audit_log_mutation();
```

**Log chaining (future — for tamper evidence):**
```sql
-- Add to workspace_audit_log:
ALTER TABLE workspace_audit_log
  ADD COLUMN IF NOT EXISTS previous_hash text,
  ADD COLUMN IF NOT EXISTS entry_hash text GENERATED ALWAYS AS (
    md5(id::text || org_id::text || event_type || created_at::text || COALESCE(previous_hash,''))
  ) STORED;
```

Each entry's hash includes the previous entry's hash. Deleting or modifying any historical entry breaks the chain — detectable on audit.

---

### Actor Attribution

Every mutation surfaces in audit with:
- `actor_id`: auth.uid() — never null for user-initiated actions
- `actor_role`: role at the time of the action (snapshot, not current role)
- `ip_address`: available in Edge Functions via `req.headers.get('x-forwarded-for')`; not available from client-side Supabase (Supabase does not expose client IP in RLS context)

For financial mutations above threshold: also capture `approved_by` and `approved_at` (maker-checker).

---

### Permission Escalation Auditing

```sql
-- Every role change on org_members → workspace_audit_log via trigger
CREATE OR REPLACE FUNCTION fn_audit_member_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO workspace_audit_log (
      org_id, event_type, actor_id, reference_type, reference_id,
      before, after
    ) VALUES (
      NEW.organization_id,
      CASE
        WHEN OLD.status = 'active' AND NEW.status = 'inactive' THEN 'member.removed'
        WHEN OLD.role IS DISTINCT FROM NEW.role THEN 'member.role_changed'
        ELSE 'member.updated'
      END,
      auth.uid(),
      'organization_member',
      NEW.id,
      jsonb_build_object('role', OLD.role, 'status', OLD.status),
      jsonb_build_object('role', NEW.role, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_member_changes
  AFTER UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION fn_audit_member_role_change();
```

Any escalation from `member → admin` or `admin → owner` is recorded with the actor who performed it and the exact timestamp.

---

## PART 8 — FINAL CTO ASSESSMENT

---

### Top 5 Existential Scale Risks (Remaining)

**1. Client-Side Capability Gates (P0 urgency)**
All feature access control is bypassable by any user who understands the codebase. `lib/capabilities.ts` runs entirely in the browser/app. No plan tier enforcement at DB level. An enterprise customer who discovers this destroys trust overnight. Fix: server-derived capabilities from `organization_plans` table + RLS plan checks.

**2. Invoice Legal Exposure**
Every invoice generated today is re-rendered from mutable live data. If any GST audit requests the original invoice from 18 months ago and the trip data has since changed, the regenerated PDF will not match what was sent to the client. This is a legal liability for every Indian org on the platform. Fix: immutable snapshot system (P1-001).

**3. Realtime Fan-out Architecture**
The current model broadcasts all org-level changes to all connected clients. At 200+ concurrent orgs with 5+ dispatchers each and 50+ active trips, the Supabase Realtime broker becomes a bottleneck. Postgres CDC fan-out at this rate triggers Supabase plan limits and client-side backpressure. Fix: typed broadcasts, subscription budgets, Edge Function debounce (P2-001).

**4. trips.service.ts Bottleneck**
At 2162 LOC, the trips domain cannot be parallelized. Any new enterprise feature (cargo type, insurance hooks, AI routing, multi-stop trips) must navigate and not break this monolith. Every sprint that touches trips is a merge conflict sprint. Fix: decomposition plan (Part 3).

**5. No Unified Notification Architecture**
Trip assignment notifications silently fail. There is no retry, no inbox, no delivery guarantee. For a driver operations platform, a missed trip assignment notification is an operational failure — a driver doesn't show, freight doesn't move, client files complaint. Fix: notification system (Part 5).

---

### Platform Capability Assessment

**500-truck operators:**
CAPABLE with caveats. Trip lifecycle, assignment, status tracking, and finance ledger are production-grade. The capability gaps are: invoice compliance (legal risk), maker-checker for large payouts (finance risk), and realtime at scale (performance risk). Operationally viable today for < 200 active trips; stressed above that.

**Multi-branch brokers:**
NOT YET CAPABLE. `OrganizationContext` is hardcoded to `orgs[0]`. A broker managing 3 branch offices must create 3 separate accounts. The `organization_hierarchy` model does not exist. Cross-org finance visibility (parent → subsidiary) does not exist. This is a hard ceiling on the enterprise broker segment.

**Enterprise finance workflows:**
PARTIALLY CAPABLE. Double-entry ledger exists, trip-linked transactions exist, shared ledger for cross-org visibility exists. Missing: maker-checker approvals, invoice immutability, GST compliance fields, transaction source traceability, void semantics enforcement. Finance managers at 500-truck operators will hit these gaps within 60 days of onboarding.

**AI copilots:**
ARCHITECTURE IS READY. `features/ai/ai.service.ts` exists. `trip_workflow_events` provides event sourcing suitable for AI state derivation. Supabase vector extension availability enables semantic search. The data model is AI-ready. What's missing is: sufficient historical data volume, structured HSN/tax data for AI suggestions, and an AI Edge Function infrastructure pattern. AI copilots can be built on top of the current foundation without architectural changes.

---

### Maturity Level

**Assessment: Growth-Stage**

The codebase is significantly beyond startup MVP. Evidence:
- 324 migrations demonstrating systematic schema evolution
- Row-level security on every table
- Event-sourced workflow architecture
- Ref-counted realtime channels with health telemetry
- Multi-party cross-org chat with lane multiplexing
- Delta sync for offline-tolerant operation
- Employment stint passbook model for driver rehires
- Circuit breaker in auth restore

It is NOT enterprise-capable today because:
- Invoice legal compliance is absent
- All capability gates are client-side
- Multi-org support is missing
- No notification delivery guarantees
- No maker-checker for financial actions
- Single-org session model with no revocation guarantee

The gap from growth-stage to enterprise-capable is 60–90 days of focused execution on the P0/P1 items in this document.

---

### The Single Highest Leverage Refactor

**Server-derived capabilities from `organization_plans` (P1-003)**

This single change:
1. Closes the client-side capability bypass security hole
2. Unlocks plan-tier-based feature gating (required for monetization)
3. Enables seat limit enforcement (required for enterprise contracts)
4. Creates the foundation for org-level feature flags (kill switches, beta features)
5. Enables the multi-org model (each org has its own plan, derived independently on switch)
6. Is the prerequisite for: maker-checker thresholds, GST compliance gating, AI feature gating, white-label features

Every other enterprise feature is gated behind "does this org have a plan that includes this feature?" Without a plan table and server derivation, you cannot enforce any feature boundary. It takes 3–4 days to implement, zero downtime, zero user-facing changes for existing customers, and unlocks the entire enterprise monetization model.

Build this first.

---

*Document Version: 1.0 | Principal Engineer Review | Status: AUTHORITATIVE*
*All implementation decisions should be validated against this document before sprint commitment.*
