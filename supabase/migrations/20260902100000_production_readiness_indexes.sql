-- ─────────────────────────────────────────────────────────────────────────────
-- Production Readiness — Missing Indexes & Query Optimizations
-- Risk Register: Top findings from Phase 4 audit
-- Target: 500 customers, 50K trips/day, 500K events/day
-- ─────────────────────────────────────────────────────────────────────────────

-- ── RISK-01: RLS trips policy — correlated subquery on drivers ───────────────
-- Each trip SELECT for a driver fires: SELECT 1 FROM drivers WHERE user_id=auth.uid()
-- Add covering index so the correlated subquery is an index-only scan.

CREATE INDEX IF NOT EXISTS idx_drivers_user_id_id
  ON public.drivers(user_id, id)
  WHERE user_id IS NOT NULL;

-- ── RISK-02: trips — hot columns for list/filter queries ─────────────────────
-- getTripsByOrganization() sorts/filters by: status, pickup_date, driver_id, client_name
-- Multi-column partial indexes for the common query patterns.

CREATE INDEX IF NOT EXISTS idx_trips_org_status_date
  ON public.trips(organization_id, status, pickup_date DESC NULLS LAST)
  WHERE status NOT IN ('completed', 'cancelled', 'done', 'delivered');

CREATE INDEX IF NOT EXISTS idx_trips_org_driver_active
  ON public.trips(organization_id, driver_id)
  WHERE driver_id IS NOT NULL
    AND status NOT IN ('completed', 'cancelled', 'done', 'delivered');

CREATE INDEX IF NOT EXISTS idx_trips_supplier_active
  ON public.trips(supplier_id, organization_id)
  WHERE supplier_id IS NOT NULL
    AND status NOT IN ('completed', 'cancelled', 'done', 'delivered');

-- ── RISK-03: transactions — finance ledger performance ────────────────────────
-- getTransactionsByOrganization() sorts by transaction_date DESC, created_at DESC
-- Compound index matches the ORDER BY exactly.

CREATE INDEX IF NOT EXISTS idx_transactions_org_date_created
  ON public.transactions(organization_id, transaction_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_trip_id
  ON public.transactions(trip_id)
  WHERE trip_id IS NOT NULL;

-- ── RISK-04: indents — marketplace query patterns ─────────────────────────────
-- Load board filters by: status, pickup date, vehicle_type, load_type

CREATE INDEX IF NOT EXISTS idx_indents_org_status_created
  ON public.indents(organization_id, status, created_at DESC)
  WHERE status IN ('pending', 'quoted', 'awarded');

CREATE INDEX IF NOT EXISTS idx_indents_public_discovery
  ON public.indents(status, created_at DESC)
  WHERE status = 'pending';   -- marketplace load board queries

-- ── RISK-05: organization_members — RLS hot path ──────────────────────────────
-- is_org_member() fires on EVERY RLS policy check — must be index-only scan.

CREATE INDEX IF NOT EXISTS idx_org_members_user_org_status
  ON public.organization_members(user_id, organization_id, status)
  WHERE status = 'active';

-- ── RISK-06: drivers — phone lookup (fleet management) ────────────────────────
-- assignTripDriverByPhone normalizes and looks up by last-10 of phone

CREATE INDEX IF NOT EXISTS idx_drivers_phone_org
  ON public.drivers(organization_id, phone)
  WHERE phone IS NOT NULL AND tracking_only IS NOT TRUE;

-- ── RISK-07: event_store — aggregate projection queries ───────────────────────
-- Already indexed in Phase 3; add covering index for type + time windows

CREATE INDEX IF NOT EXISTS idx_event_store_agg_version
  ON public.event_store(aggregate_id, version);

-- ── RISK-08: idempotency_keys — cleanup job and status checks ────────────────
-- Already has PK on key; add for the cleanup query and status dashboard

CREATE INDEX IF NOT EXISTS idx_ik_status_created
  ON public.idempotency_keys(status, created_at DESC)
  WHERE status IN ('pending', 'failed');

-- ── RISK-09: trip_messages — chat performance ─────────────────────────────────
-- Queries: by conversation_id ORDER BY created_at, by sender_user_id

CREATE INDEX IF NOT EXISTS idx_trip_messages_conv_created
  ON public.trip_messages(conversation_id, created_at DESC);

-- ── RISK-10: trip_conversations — bootstrap query ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trip_convs_org_updated
  ON public.trip_conversations(organization_id, updated_at DESC);

-- ── RISK-11: Analyze new indexes ─────────────────────────────────────────────
ANALYZE public.trips;
ANALYZE public.transactions;
ANALYZE public.indents;
ANALYZE public.organization_members;
ANALYZE public.drivers;
ANALYZE public.trip_messages;
ANALYZE public.trip_conversations;
