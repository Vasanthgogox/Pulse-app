PULSE LOGISTICS PLATFORM — FULL ARCHITECTURE & DATABASE AUDIT
  
  Auditor Grade: Principal Backend Architect / DBA
  Date: 2026-06-11
  DB Tables Audited: 97 (public schema) | Migrations: 388 | Functions: 160+

  ---
  A. Architecture Flow Diagram

  User Signup (email/password)
    → auth.users INSERT (Supabase Auth)
    → handle_new_user() TRIGGER [SECURITY DEFINER]
    → public.users INSERT (31-col profile table)
    → public.profiles INSERT (3-col display table)
    → activate_pulse_core_on_org_create() on org creation
    → organization_members INSERT (owner row)

  Login
    → auth.signInWithPassword()
    → JWT issued (access + refresh)
    → AuthContext.getSession() → getProfile() → public.users
    → roleVerified confirmed server-side
    → Route to /(tabs) [dispatcher] or /(driver) [driver]

  Client/Supplier/Driver/Vehicle Creation
    → SECURITY DEFINER RPC or direct table INSERT
    → RLS: organization_id must match org_member
    → duplicate prevention via (org_id, phone) UNIQUE indexes
    → operational_code generated via trigger

  Trip Creation
    → createTrip() service → supabase().from('trips').insert()
    → BEFORE triggers: set_trip_operational_identity(), set_trip_operational_code(),
      trips_sync_driver_vehicle_display(), trips_set_booking_ref(),
      assign_driver_display_trip_id()
    → enforce_single_active_trip_per_driver() BEFORE trigger
    → Default status: 'assigned' ← WRONG (should be 'draft')
    → AFTER trigger: fn_broadcast_trip_status_to_chat()

  Assignment
    → driver_update_trip_status() / assign_aggregate_trip_driver() SECURITY DEFINER
    → No SELECT FOR UPDATE → Race condition possible

  Acceptance → Execution → Completion
    → change_trip_status_with_notification() SECURITY DEFINER
    → log_trip_completed() AFTER trigger
    → Billing/settlement: transactions INSERT (manual, no auto-trigger)
    → POD: trip_documents INSERT, pod_received_at stamped manually

  ---
  B. Database Relationship Diagram (Key Entities)

  auth.users (Supabase Auth)
      │ 1:1 trigger
      ▼
  public.users (31 cols — real profile)   public.profiles (3 cols — display only)
      │                                          │
      ├── organization_members (M:M)             │ (RLS on public role — risk)
      │       │
      │       └── organizations
      │               │
      │    ┌──────────┼──────────────┐
      │    ▼          ▼              ▼
      │  clients   suppliers      drivers ──── vehicles
      │    │ SET NULL  │ SET NULL     │ SET NULL   │ SET NULL
      │    └───────────┴─────────────┴────────────┘
      │                              │
      └──────────────────────────────▼
                                trips (CASCADE org, CASCADE owner_user ← CRITICAL)
                                  │
                      ┌───────────┼─────────────────┐
                      ▼           ▼                  ▼
                transactions  trip_messages    trip_assignment_audit
                  (SET NULL)    (RLS via org)        (append-only)
                      │
                      └── driver_ledger (manual accounting)

  ---
  C. Critical Issues Report

  ---
  🔴 CRITICAL

  ---
  C1. Nine Views Have NO Security Invoker — Full Cross-Org Data Leakage

  v_active_trips, v_client_revenue, v_driver_balances, v_driver_tracking_health,
  v_long_haul_health, v_open_indents, workspace_members, workspaces,
  trip_messages_archive_candidates

  None have WITH (security_invoker = true). Views bypass RLS by default in Postgres. They run as the view owner
  (postgres/superuser, which has bypassrls). Any authenticated user can query SELECT * FROM v_active_trips and receive
  trips from every organization on the platform. Same for workspace_members (all team rosters), workspaces (all org details
  with PAN/GSTIN), v_client_revenue (all clients' billing data).

  This is a complete multi-tenant data isolation failure.

  Fix: ALTER VIEW v_active_trips SET (security_invoker = true); for all 9 views, or move to a restricted schema.

  ---
  C2. trips.owner_user_id → ON DELETE CASCADE

  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE

  Deleting a user cascades to delete all their trips. Trips contain financial records, POD, fuel entries, transactions
  (which are SET NULL on trip_id). On a platform handling ₹100 Cr+ ops, this is catastrophic irreversible data loss. Should
  be SET NULL or RESTRICT.

  ---
  C3. 160+ SECURITY DEFINER Functions in public Schema — Callable by anon
  
  Postgres grants EXECUTE to PUBLIC by default for every new function. With 160+ SECURITY DEFINER functions in public,
  every one of them is an unauthenticated API endpoint if anonymous auth is enabled.

  Particularly dangerous ones:
  - get_email_by_phone(p_phone text) — PII lookup, no auth check visible
  - get_driver_invitee_by_phone(p_phone text) — returns user data by phone
  - get_invitee_by_phone(p_phone text) — same
  - get_invitees_by_phones(p_phones text[]) — bulk phone lookup
  - stress_test_chat_messages(...) — A LOAD TEST FUNCTION IN PRODUCTION that inserts 500 messages into any conversation. A
  malicious actor can spam any conversation.
  - kill_idle_in_transaction_sessions() — terminates DB sessions
  - get_platform_health() — exposes platform metrics to anyone

  Immediate action required: REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public; REVOKE EXECUTE ON ALL FUNCTIONS 
  IN SCHEMA public FROM anon; then grant selectively.

  ---
  C4. RLS Policies Using {public} Role (Affects Unauthenticated Users)
  
  driver_invites: ALL policies — {public}
  indents: "Org members can manage indents" — {public}
  vehicles: "Org members can manage vehicles" — {public}
  suppliers: "Drivers can read suppliers" — {public}
  transactions: "Drivers can read supplier transactions" — {public}
  profiles: ALL policies — {public}

  The public role in Postgres means unauthenticated users. These policies allow anonymous users to attempt reads if they
  can somehow satisfy the auth.uid() predicate. While auth.uid() returns NULL for anon users which prevents most access,
  using {public} instead of {authenticated} is incorrect and fragile — any future anonymous sign-in enablement breaks
  isolation. Should use TO authenticated.

  ---
  C5. enforce_single_active_trip_per_driver Has Race Condition

  The trigger runs at READ COMMITTED isolation. The check:
  IF public.driver_has_other_active_trip(NEW.driver_id, NEW.id) ...

  Two concurrent transactions can both read "no active trip" and both proceed. There is no SELECT FOR UPDATE on the driver
  row. Under concurrent assignment (multi-dispatcher org), a driver can be double-booked.

  Fix: Lock the driver row before the check with SELECT id FROM drivers WHERE id = NEW.driver_id FOR UPDATE.

  ---
  🟠 HIGH RISK

  ---
  H1. Two Tables Completely Open (RLS Disabled, No Policies)

  - event_schema_registry — rowsecurity = false, zero policies. Any authenticated user can read/write/delete schema
  registry entries.
  - platform_metrics — rowsecurity = false, zero policies. Platform-wide metrics readable by any user.

  ---
  H2. Three Tables With RLS Enabled But Zero Policies — Complete Lockout

  - driver_trip_counters — RLS ON, zero policies. Inaccessible via API. Counter data silently fails to read/write.
  - ops_agent_rate_log — RLS ON, zero policies. Rate limiting may be silently broken.
  - trip_location_checkpoints_default — RLS ON, zero policies. Location checkpoint data inaccessible.

  If trip_location_checkpoints_default is a partition of trip_location_checkpoints, the parent table's policies don't
  cascade to partitions in Postgres. Every partition needs its own policies.

  ---
  H3. Trip Status is a Text Free-for-All With 16 Values, Not an ENUM

  CHECK (status = ANY (ARRAY[
    'draft','pending_acceptance','assigned','in_progress','picked_up',
    'in_transit','transit','at_pickup','loading','at_drop','unloading',
    'completed','cancelled','delivered','done','active'
  ]))

  - transit and in_transit — duplicate semantics
  - completed, delivered, done — three terminal states with unclear difference
  - active — means nothing specific
  - No state machine enforcement. draft → completed is valid at DB level.
  - The completed_at constraint only fires for 'completed' status, ignoring 'done' and 'delivered'.

  This causes application code to scatter status IN ('completed', 'done', 'delivered') everywhere. Maintenance nightmare.

  ---
  H4. No Status Transition Validation at DB Level
  
  Any application code (or direct API call by an org member) can jump trips.status from assigned → completed, skipping
  in_progress. RLS grants ALL to org members on trips, meaning a dispatcher can set any status to any value. Business logic
  lives exclusively in SECURITY DEFINER RPCs, which are bypassable via direct table operations.

  ---
  H5. users Table is the Real Profile Table, profiles Has 3 Columns

  The public.users table (31 columns) is the actual profile table. public.profiles has only 3 columns (id, name,
  created_at). This naming is backwards relative to every Supabase convention and the project's own documentation
  (CONTEXT_INDEX.md says profiles is the extended profile). The handle_new_user trigger presumably populates public.users,
  not public.profiles. This causes confusion for every future developer and creates sync issues between the two tables.

  ---
  H6. Denormalized Financials on Trips With No Audit Trail
  
  trips stores client_price, supplier_rate, margin, platform_fee, driver_commission as flat numerics. If any of these are
  changed after trip creation (price renegotiation, rate revision), there is no before/after history. For ₹100 Cr+
  operations, this is a compliance failure — you cannot audit what was the original agreed rate vs. what was actually
  billed.

  ---
  H7. Driver Documents Stored on users Table
  
  public.users has columns: vehicle_registration, license_photo_url, license_expiry, insurance_photo_url, insurance_expiry,
  vehicle_registration_photo_url, vehicle_registration_expiry, license_number, license_type.

  These are document fields for drivers stored on every user row including dispatchers. Also, there's a separate
  entity_documents table and driver_profiles table. Document data is duplicated across 3 places with no clear authority
  source.

  ---
  🟡 MEDIUM RISK

  ---
  M1. Duplicate Constraints + Redundant Indexes on trips(org_id, trip_number)

  trips_org_trip_number_unique     — UNIQUE CONSTRAINT (DEFERRABLE)
  trips_organization_id_trip_number_key — UNIQUE CONSTRAINT (non-deferrable)
  idx_trips_org_trip_number        — regular INDEX on same columns

  Three structures for one uniqueness requirement. The non-deferrable constraint plus the regular index is pure waste. Each
  adds overhead to every INSERT/UPDATE.

  ---
  M2. trips Has 50+ Indexes — Write Amplification at Scale
  
  Every INSERT into trips must maintain 50+ index structures. At 1,000 trips/day this is manageable. At 10,000 trips/day,
  write latency will increase significantly. Many indexes are highly specific (e.g., idx_trips_unlinked_client,
  idx_trips_pod_pending) and likely serve very infrequent queries. These should be evaluated for removal.

  ---
  M3. RLS Policies Do Subquery on Every Row — N+1 Pattern
  
  Every RLS SELECT policy on major tables does:
  organization_id IN (
    SELECT organization_members.organization_id
    FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  )

  This subquery executes per-row during a full scan. For a table with 1M trips across 1000 orgs, each query evaluates this
  predicate millions of times. Supabase does cache auth.uid() (note the SELECT auth.uid() pattern is a minor optimization),
  but the IN (subquery) on organization_members is not cached per statement. Should use EXISTS or join-based policies with
  proper indexes, or consider my_organization_ids() STABLE function.

  ---
  M4. trips.status Default is 'assigned'

  status text NOT NULL DEFAULT 'assigned'

  A newly created trip with no driver assigned starts in 'assigned' state. This is semantically wrong. A trip should start
  in 'draft' or 'pending' and transition to 'assigned' only when a driver+vehicle are confirmed. Dispatchers who create
  trips without immediate assignment are in an invalid state from the start.

  ---
  M5. transactions.trip_id is SET NULL on Trip Delete

  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL

  If a trip is soft-deleted (or hard-deleted), its financial transactions lose their trip linkage silently. A ledger entry
  becomes an orphan with no traceable source trip. This is an accounting integrity failure.

  ---
  M6. trips_check: amount_paid <= client_price Prevents Overpayment Recording
  
  In Indian freight, customers sometimes overpay as advance or due to rounding. The constraint rejects valid financial
  reality. Also, it checks against client_price at time of constraint evaluation, but client_price can be updated, creating
  silent inconsistencies.

  ---
  M7. No Idempotency on Trip/Transaction Creation From App Layer
  
  The idempotency_keys table exists but is only used by specific SECURITY DEFINER functions. The primary service layer
  (createTrip, createTransaction) in the app makes direct table inserts without idempotency keys. Network retries on mobile
  (25s timeout + 1 retry) can create duplicate trips/transactions.

  ---
  M8. trips_one_per_indent — One Indent → One Trip Forever

  UNIQUE INDEX trips_one_per_indent ON trips(indent_id) WHERE indent_id IS NOT NULL

  Partial loads, multi-truck indents, cancelled-and-recreated trips all break against this constraint. This limits the
  business model to single-truck-per-indent.

  ---
  M9. Soft-Delete Inconsistency

  The trips table has deleted_at, but the primary RLS policies do NOT filter WHERE deleted_at IS NULL. Only specific
  indexes and views do. Soft-deleted trips are still returned by org member queries unless the application layer manually
  adds deleted_at IS NULL — which is inconsistently applied.

  ---
  M10. No Partitioning on High-Volume Tables
  
  trip_messages, driver_locations, trip_location_checkpoints, transactions will grow unbounded. No partitioning strategy is
  defined. At 10,000 trips/day with 50 messages/trip, trip_messages grows by 500,000 rows/day = 180M rows/year. Queries
  will slow dramatically without partitioning by created_at or organization_id.

  ---
  🟢 GOOD PRACTICES

  ---
  - Comprehensive index coverage on trips — (org_id, status), (org_id, pickup_date), (driver_id, status), (supplier_id, 
  status) all present. Query patterns for common dispatcher views are well-served.
  - GIN indexes on JSONB/array columns (documents, metadata, operating_areas) — correct choice for array containment
  queries.
  - Trigram indexes on name columns (idx_clients_name_trgm, idx_suppliers_name_trgm) — good for fuzzy search.
  - trip_assignment_audit is append-only — correct audit trail for assignment history.
  - Composite unique partial indexes (idx_drivers_active_phone, idx_drivers_active_user) that only enforce uniqueness on
  active records — well-designed for soft-delete patterns.
  - trips_org_trip_number_unique is DEFERRABLE — correct for bulk trip creation sequences.
  - check_rate_limit and enforce_rpc_rate_limit SECURITY DEFINER RPCs — rate limiting exists, even if incompletely wired.
  - Realtime invalidation architecture using Postgres CDC — correct pattern, avoids polling.
  - enforce_single_active_trip_per_driver trigger — concept is right even if implementation has race condition.
  - idempotency_keys table — shows awareness of distributed systems concerns.
  - event_outbox + event_store — outbox pattern for event-driven architecture shows enterprise intent.

  ---
  D. Scalability Assessment

  ┌─────────────────────────┬───────┬──────────────────────────────────────────────────────────────────────────────────┐
  │        Dimension        │ Score │                                     Verdict                                      │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────────────────────────────────┤
  │ Database Design         │ 5/10  │ Two profile tables, 16 statuses, duplicate constraints, no partitioning          │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────────────────────────────────┤
  │ Security                │ 4/10  │ 160+ SECURITY DEFINER in public, views bypass RLS, public-role policies          │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────────────────────────────────┤
  │ Maintainability         │ 4/10  │ 388 migrations, inverted naming (users/profiles), sprawling status enum          │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────────────────────────────────┤
  │ Performance             │ 5/10  │ 50+ indexes on trips, subquery RLS policies, no partitioning                     │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────────────────────────────────┤
  │ Logistics Domain        │ 6/10  │ Core entities correct, cross-org trips modeled, but financials denormalized      │
  │ Modeling                │       │                                                                                  │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────────────────────────────────┤
  │ Enterprise Readiness    │ 4/10  │ Missing audit trail on prices, cascade deletes on financial data, no SLA on      │
  │                         │       │ status transitions                                                               │
  └─────────────────────────┴───────┴──────────────────────────────────────────────────────────────────────────────────┘

  1,000 trips/day: Runs fine today.
  10,000 trips/day: trip_messages and driver_locations become bottlenecks. Write amplification from 50+ indexes on trips
  becomes measurable (50–100ms insert latency). RLS subquery cost increases with org member table growth.
  100,000 trips/day: System fails without: table partitioning, RLS policy redesign (materialized org membership), index
  pruning, read replicas for driver location queries, and connection pooling via PgBouncer.

  First to break under scale: The RLS subquery pattern on organization_members. As the platform grows to thousands of orgs
  with hundreds of members each, every row evaluation of every query on every table does a lookup into
  organization_members. This becomes the global chokepoint.

  ---
  E. Brutally Honest Verdict

  Would you approve this schema for production?
  No, not as-is. The view-bypass-RLS issue alone is a production data breach. I'd gate on that and the SECURITY DEFINER
  function exposure before allowing production traffic.

  Would you approve this for ₹100 Cr+ logistics operations?
  No. owner_user_id → ON DELETE CASCADE can wipe trip records when a staff member leaves. Denormalized pricing with no
  audit trail is a billing dispute nightmare. No status transition enforcement at DB level means financial records can
  enter inconsistent states silently.

  What would break first under scale?
  The RLS policy subquery on organization_members. Every query on every table with org-scoped policies evaluates SELECT 
  organization_id FROM organization_members WHERE user_id = auth.uid() per row. At 100K daily active users across a busy
  time window, this becomes a full table scan pattern that kills connection pool capacity.

  What would you redesign immediately?
  1. Fix the 9 views to use security_invoker = true — data breach risk
  2. REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public — attack surface
  3. owner_user_id FK to SET NULL — prevent trip cascade
  4. Collapse 16 trip statuses into ≤7 with a proper state machine enforced via trigger
  5. Swap users and profiles naming to match convention
  6. Add SELECT FOR UPDATE to the double-booking check trigger

  What would a top-tier architect do differently?
  - Replace text status + CHECK constraint with a CREATE TYPE trip_status AS ENUM(...) with a state-machine trigger that
  validates allowed transitions 
  - Store pricing history in a trip_price_history table; keep current price on trips
  - Partition trip_messages and driver_locations by month
  - Replace RLS subquery policies with a STABLE function my_org_ids() that materializes inside a transaction and index-only
  scans organization_members
  - Separate driver documents entirely into entity_documents; remove document columns from users
  - Drop 20–30 redundant/rarely-used indexes on trips; keep only the high-cardinality composite ones
  - Give event_outbox / event_store actual consumers — right now they appear to emit but nothing consumes

  Is the system over-engineered, under-engineered, or poorly modeled?
  Simultaneously over-engineered and under-engineered in different layers. The infrastructure layer is overbuilt: 160+
  SECURITY DEFINER functions, 388 migrations, 50+ indexes on one table, event outbox, identity engines, operational codes,
  global references, activity streams — enormous complexity. Yet the core safety layer is underbuilt: no status machine
  validation, no financial audit trail, no partitioning, cascade delete on financial records, views that bypass tenant
  isolation. It's an early-stage product that added enterprise features on top of a foundation that was never hardened.