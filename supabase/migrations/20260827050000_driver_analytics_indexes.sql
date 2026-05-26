-- Driver Performance Analytics — server-side aggregation function.
--
-- Provides efficient monthly P&L aggregation per driver for the
-- Performance Analytics tab. Mirrors the vehicle analytics migration pattern.
--
-- Rollback:
--   DROP FUNCTION get_driver_monthly_analytics(uuid, uuid, int);
--   DROP INDEX IF EXISTS idx_trips_driver_pickup_date;
--   DROP INDEX IF EXISTS idx_trips_driver_id_status;
--   DROP INDEX IF EXISTS idx_transactions_driver_contact;

-- ── Supporting indexes ────────────────────────────────────────────────────────

-- Composite index on driver_id + pickup_date for efficient period slicing.
-- CONCURRENTLY — no table lock, safe to run on live production.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_driver_pickup_date
  ON trips (driver_id, pickup_date DESC)
  WHERE driver_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_driver_id_status
  ON trips (organization_id, driver_id, status)
  WHERE driver_id IS NOT NULL;

-- Index for transaction contact lookups (driver payments)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_driver_contact
  ON transactions (organization_id, contact_id, transaction_date DESC)
  WHERE contact_type = 'driver';

-- ── Monthly analytics RPC ──────────────────────────────────────────────────────
--
-- Returns up to N months of aggregated trip earnings for one driver.
-- Joins transactions to compute actual payments per month.
--
-- Parameters:
--   p_org_id       — caller's organization (RLS check)
--   p_driver_id    — target driver
--   p_months_back  — how many months to include (default 12)
--
-- Returns per-month: period, revenue, earnings, paid, trip_count, km_driven
--
-- Security: SECURITY DEFINER + explicit auth.uid() org membership check.
-- Rollback: DROP FUNCTION get_driver_monthly_analytics(uuid, uuid, int);

CREATE OR REPLACE FUNCTION get_driver_monthly_analytics(
  p_org_id      uuid,
  p_driver_id   uuid,
  p_months_back int DEFAULT 12
)
RETURNS TABLE (
  period       text,        -- 'YYYY-MM'
  revenue      numeric,     -- sum of client_price
  earnings     numeric,     -- sum of driver_commission (10% fallback)
  paid         numeric,     -- sum of amount_out from transactions
  trip_count   bigint,
  km_driven    numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Membership gate: caller must belong to the requested org.
  -- Returns empty set (not 403) to avoid leaking org existence.
  WITH _access AS (
    SELECT 1 FROM org_members
    WHERE org_members.organization_id = p_org_id
      AND org_members.user_id = auth.uid()
    LIMIT 1
  ),
  _period_start AS (
    SELECT date_trunc('month', now() - (p_months_back - 1 || ' months')::interval) AS start_dt
  ),
  _driver_trips AS (
    SELECT
      t.id                                       AS trip_id,
      t.client_price                             AS client_price,
      t.driver_commission                        AS driver_commission,
      t.supplier_rate                            AS supplier_rate,
      t.distance                                 AS distance,
      COALESCE(t.pickup_date, t.created_at)      AS trip_date
    FROM trips t
    WHERE
      t.driver_id = p_driver_id
      AND t.organization_id = p_org_id
      AND COALESCE(t.pickup_date, t.created_at) >= (SELECT start_dt FROM _period_start)
      AND EXISTS (SELECT 1 FROM _access)
  ),
  -- Actual payments out to this driver from ledger
  _driver_payments AS (
    SELECT
      to_char(date_trunc('month', COALESCE(tx.transaction_date, tx.created_at)::date), 'YYYY-MM') AS period,
      SUM(COALESCE(tx.amount_out, 0)) AS paid
    FROM transactions tx
    WHERE tx.contact_id = p_driver_id
      AND tx.organization_id = p_org_id
      AND tx.contact_type = 'driver'
      AND COALESCE(tx.amount_out, 0) > 0
      AND COALESCE(tx.transaction_date, tx.created_at::date) >= (SELECT start_dt FROM _period_start)
      AND EXISTS (SELECT 1 FROM _access)
    GROUP BY 1
  ),
  _monthly AS (
    SELECT
      to_char(date_trunc('month', dt.trip_date), 'YYYY-MM') AS period,
      SUM(COALESCE(dt.client_price, 0))                     AS revenue,
      -- Commission: driver_commission if set, else 10% of supplier_rate, else 10% of client_price
      SUM(
        CASE
          WHEN dt.driver_commission IS NOT NULL AND dt.driver_commission > 0
            THEN dt.driver_commission
          WHEN dt.supplier_rate IS NOT NULL AND dt.supplier_rate > 0
            THEN dt.supplier_rate * 0.10
          ELSE COALESCE(dt.client_price, 0) * 0.10
        END
      )                                                      AS earnings,
      COUNT(*)                                               AS trip_count,
      SUM(COALESCE(dt.distance, 0))                         AS km_driven
    FROM _driver_trips dt
    GROUP BY 1
  )
  SELECT
    m.period,
    m.revenue,
    m.earnings,
    COALESCE(p.paid, 0)  AS paid,
    m.trip_count,
    m.km_driven
  FROM _monthly m
  LEFT JOIN _driver_payments p ON p.period = m.period
  ORDER BY m.period ASC;
$$;

GRANT EXECUTE ON FUNCTION get_driver_monthly_analytics(uuid, uuid, int) TO authenticated;
