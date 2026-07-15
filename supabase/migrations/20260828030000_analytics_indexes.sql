-- ============================================================================
-- Analytics covering indexes — client / supplier / driver dashboards.
--
-- These indexes accelerate the RPCs introduced in
-- `20260828020000_analytics_rpcs.sql`. All are partial + `CONCURRENTLY`,
-- safe on live production (no table lock, no statement-cancel risk).
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_trips_client_pickup_date;
--   DROP INDEX IF EXISTS idx_trips_client_id_status;
--   DROP INDEX IF EXISTS idx_trips_supplier_pickup_date;
--   DROP INDEX IF EXISTS idx_trips_supplier_id_status;
--   DROP INDEX IF EXISTS idx_trips_completed_lifecycle;
--   DROP INDEX IF EXISTS idx_transactions_client_contact;
--   DROP INDEX IF EXISTS idx_transactions_supplier_contact;
-- ============================================================================

-- Trips by client + period — drives `get_client_monthly_analytics`.
CREATE INDEX IF NOT EXISTS idx_trips_client_pickup_date
  ON public.trips (client_id, pickup_date DESC)
  WHERE client_id IS NOT NULL;

-- Trips by client + status — drives completion / cancellation metrics.
CREATE INDEX IF NOT EXISTS idx_trips_client_id_status
  ON public.trips (organization_id, client_id, status)
  WHERE client_id IS NOT NULL;

-- Trips by supplier + period — drives `get_supplier_monthly_analytics`.
CREATE INDEX IF NOT EXISTS idx_trips_supplier_pickup_date
  ON public.trips (supplier_id, pickup_date DESC)
  WHERE supplier_id IS NOT NULL;

-- Trips by supplier + status — drives reliability + cancellation metrics.
CREATE INDEX IF NOT EXISTS idx_trips_supplier_id_status
  ON public.trips (organization_id, supplier_id, status)
  WHERE supplier_id IS NOT NULL;

-- Covering index for on-time computation: only trips with both lifecycle
-- timestamps present. Targets `WHERE completed_at IS NOT NULL AND
-- pickup_date IS NOT NULL` filter used across all three score engines.
CREATE INDEX IF NOT EXISTS idx_trips_completed_lifecycle
  ON public.trips (organization_id, completed_at)
  WHERE completed_at IS NOT NULL AND pickup_date IS NOT NULL;

-- Transactions for client AR aging — `tx.contact_type = 'client'` filter.
CREATE INDEX IF NOT EXISTS idx_transactions_client_contact
  ON public.transactions (organization_id, contact_id, transaction_date DESC)
  WHERE contact_type = 'client';

-- Transactions for supplier AP aging — `tx.contact_type = 'supplier'`.
CREATE INDEX IF NOT EXISTS idx_transactions_supplier_contact
  ON public.transactions (organization_id, contact_id, transaction_date DESC)
  WHERE contact_type = 'supplier';
