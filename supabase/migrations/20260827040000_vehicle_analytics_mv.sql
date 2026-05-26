-- Vehicle Asset Analytics — server-side aggregation function.
--
-- Avoids N+1 and real-time heavy aggregation by pre-computing monthly
-- trip P&L per vehicle in a single RPC call. Used by the Asset Analytics
-- tab when the client-side derivation needs server validation or for
-- future background materialization.
--
-- Client-side computation is sufficient for Phase 1 (data already loaded).
-- This function enables Phase 2: server-side caching via periodic refresh.
--
-- Rollback:
--   DROP FUNCTION get_vehicle_monthly_analytics(uuid, uuid, int);
--   DROP INDEX IF EXISTS idx_trips_vehicle_pickup_date;
--   DROP INDEX IF EXISTS idx_trips_vehicle_id_status;
--   DROP INDEX IF EXISTS idx_trips_vehicle_display_number;

-- ── Supporting indexes ────────────────────────────────────────────────────────
-- Composite index on vehicle_id + pickup_date for efficient period slicing.
-- CONCURRENTLY — no table lock, safe to run on live production.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_vehicle_pickup_date
  ON trips (vehicle_id, pickup_date DESC)
  WHERE vehicle_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_vehicle_id_status
  ON trips (organization_id, vehicle_id, status)
  WHERE vehicle_id IS NOT NULL;

-- Index for display-number fallback matching (WHERE vehicle_display_number IS NOT NULL)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_vehicle_display_number
  ON trips (organization_id, vehicle_display_number)
  WHERE vehicle_display_number IS NOT NULL AND TRIM(vehicle_display_number) <> '';

-- ── Monthly analytics RPC ──────────────────────────────────────────────────────
--
-- Returns up to N months of aggregated trip P&L for one vehicle.
-- Joins transactions to compute ledger-based expenses per month.
-- Excludes driver payments from vehicle expense (mirrors garragePnL.ts logic).
--
-- Parameters:
--   p_org_id       — caller's organization (RLS check)
--   p_vehicle_id   — target vehicle
--   p_months_back  — how many months to include (default 12)
--
-- Returns per-month: period, revenue, expense, profit, margin, trip_count, km_driven
--
-- Security: SECURITY DEFINER + explicit auth.uid() org membership check.
-- Phone and PII never exposed — amounts only.
--
-- Rollback: DROP FUNCTION get_vehicle_monthly_analytics(uuid, uuid, int);

CREATE OR REPLACE FUNCTION get_vehicle_monthly_analytics(
  p_org_id      uuid,
  p_vehicle_id  uuid,
  p_months_back int DEFAULT 12
)
RETURNS TABLE (
  period       text,        -- 'YYYY-MM'
  revenue      numeric,
  expense      numeric,
  profit       numeric,
  margin_pct   numeric,     -- percentage, 0–100
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
  -- Trips matching this vehicle (by id or by display_number fuzzy)
  _vehicle_trips AS (
    SELECT
      t.id                                       AS trip_id,
      t.client_price                             AS client_price,
      t.supplier_rate                            AS supplier_rate,
      t.supplier_id                              AS supplier_id,
      t.distance                                 AS distance,
      COALESCE(t.pickup_date, t.created_at)      AS trip_date,
      t.organization_id                          AS trip_org_id
    FROM trips t
    WHERE
      (t.vehicle_id = p_vehicle_id
       OR (
         t.vehicle_display_number IS NOT NULL
         AND UPPER(REGEXP_REPLACE(t.vehicle_display_number, '[^A-Z0-9]', '', 'g'))
           = (SELECT UPPER(REGEXP_REPLACE(v.vehicle_number, '[^A-Z0-9]', '', 'g'))
              FROM vehicles v WHERE v.id = p_vehicle_id LIMIT 1)
       )
      )
      AND COALESCE(t.pickup_date, t.created_at) >= (SELECT start_dt FROM _period_start)
      AND EXISTS (SELECT 1 FROM _access)
  ),
  -- Ledger cash-out per trip, excluding driver payments
  _trip_expenses AS (
    SELECT
      tx.trip_id,
      SUM(COALESCE(tx.amount_out, 0)) AS ledger_expense
    FROM transactions tx
    WHERE tx.trip_id IN (SELECT trip_id FROM _vehicle_trips)
      AND COALESCE(tx.amount_out, 0) > 0
      -- Exclude driver commission/salary lines (mirrors TS logic)
      AND tx.contact_type IS DISTINCT FROM 'driver'
      AND UPPER(TRIM(COALESCE(tx.description, ''))) NOT IN (
        'DRIVER SALARY', 'TRIP-BASED COMMISSION', 'DRIVER COMMISSION',
        'TRIP COMMISSION', 'MONTHLY SALARY', 'SETTLEMENT',
        'ADVANCE', 'REIMBURSEMENT', 'BONUS', 'DEDUCTION',
        'ADJUSTMENT', 'COMMISSION'
      )
    GROUP BY tx.trip_id
  ),
  -- Month-bucket aggregation
  _monthly AS (
    SELECT
      to_char(date_trunc('month', vt.trip_date), 'YYYY-MM') AS period,
      -- Own trips: sales = client_price; supplier trips (we're carrier): sales = supplier_rate
      SUM(
        CASE
          WHEN vt.trip_org_id <> p_org_id THEN COALESCE(vt.supplier_rate, 0)
          ELSE COALESCE(vt.client_price, 0)
        END
      )                                        AS revenue,
      -- Expense: supplier_rate (only own trips with partner) + ledger lines
      SUM(
        CASE
          WHEN vt.trip_org_id <> p_org_id THEN 0
          WHEN vt.supplier_id IS NOT NULL THEN COALESCE(vt.supplier_rate, 0)
          ELSE 0
        END
        + COALESCE(te.ledger_expense, 0)
      )                                        AS expense,
      COUNT(*)                                 AS trip_count,
      SUM(COALESCE(vt.distance, 0))            AS km_driven
    FROM _vehicle_trips vt
    LEFT JOIN _trip_expenses te ON te.trip_id = vt.trip_id
    GROUP BY 1
  )
  SELECT
    m.period,
    m.revenue,
    m.expense,
    m.revenue - m.expense                                            AS profit,
    CASE
      WHEN m.revenue > 0 THEN ROUND(((m.revenue - m.expense) / m.revenue) * 100, 2)
      WHEN m.expense > 0 THEN -100
      ELSE 0
    END                                                              AS margin_pct,
    m.trip_count,
    m.km_driven
  FROM _monthly m
  ORDER BY m.period ASC;
$$;

GRANT EXECUTE ON FUNCTION get_vehicle_monthly_analytics(uuid, uuid, int) TO authenticated;

-- ── Document expiry index ─────────────────────────────────────────────────────
-- The documents JSONB field is queried by the analytics tab for expiry dates.
-- GIN index allows efficient jsonb_path_exists / @> lookups.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vehicles_documents_gin
  ON vehicles USING GIN (documents)
  WHERE documents IS NOT NULL;
