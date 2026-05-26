-- ============================================================================
-- Analytics RPCs — client / supplier / driver / vehicle monthly aggregation
-- and 3 server-side score engines (customer health, supplier reliability,
-- driver performance).
--
-- Why this file
-- -------------
-- Today the codebase only has two analytics RPCs
-- (`get_vehicle_monthly_analytics`, `get_driver_monthly_analytics` —
-- `20260827040000_*` / `20260827050000_*`). Both reference a non-existent
-- `org_members` table (correct table: `public.organization_members`,
-- canonical helper: `public.is_org_member(uuid)` from
-- `20260518070000_security_fix_search_path_and_is_org_member.sql`). Calls
-- silently return empty rows even when the caller is a legitimate org
-- member — so the analytics tabs work today only because they don't
-- actually invoke the RPCs (they compute everything client-side from
-- already-loaded rows).
--
-- This migration:
--   1. Recreates `get_vehicle_monthly_analytics` and
--      `get_driver_monthly_analytics` with the correct membership gate.
--   2. Adds two new monthly aggregation RPCs for clients and suppliers
--      (`get_client_monthly_analytics`, `get_supplier_monthly_analytics`).
--      Both include payment-delay and on-time metrics derived from
--      `transactions.transaction_date - trips.pickup_date` and
--      `trips.completed_at vs trips.pickup_date` respectively (the
--      schema has no SLA columns; we derive).
--   3. Adds three score-engine RPCs that mirror the TS engines in
--      `features/analytics/scores/*`:
--          • `compute_client_health_score(org_id, client_id)`
--          • `compute_supplier_reliability_score(org_id, supplier_id)`
--          • `compute_driver_performance_score(org_id, driver_id)`
--      Each returns a single `jsonb` so the client can decode without
--      column drift; all share the same `{ score, level, sub-scores,
--      breakdown }` shape used by `compute_compliance_score`.
--
-- All statements are idempotent (`CREATE OR REPLACE`); safe on replay.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recreate vehicle / driver monthly RPCs with the correct membership gate.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_vehicle_monthly_analytics(
  p_org_id      uuid,
  p_vehicle_id  uuid,
  p_months_back int DEFAULT 12
)
RETURNS TABLE (
  period       text,
  revenue      numeric,
  expense      numeric,
  profit       numeric,
  margin_pct   numeric,
  trip_count   bigint,
  km_driven    numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH _period_start AS (
    SELECT date_trunc('month', now() - (p_months_back - 1 || ' months')::interval) AS start_dt
  ),
  _vehicle_trips AS (
    SELECT
      t.id                                   AS trip_id,
      t.client_price                         AS client_price,
      t.supplier_rate                        AS supplier_rate,
      t.driver_commission                    AS driver_commission,
      t.distance                             AS distance,
      COALESCE(t.pickup_date, t.created_at)  AS trip_date
    FROM public.trips t
    WHERE
      (t.vehicle_id = p_vehicle_id)
      AND t.organization_id = p_org_id
      AND COALESCE(t.pickup_date, t.created_at) >= (SELECT start_dt FROM _period_start)
      AND public.is_org_member(p_org_id)
  ),
  _ledger_expense AS (
    SELECT
      to_char(date_trunc('month', COALESCE(tx.transaction_date, tx.created_at)::date), 'YYYY-MM') AS period,
      SUM(COALESCE(tx.amount_out, 0)) AS expense
    FROM public.transactions tx
    WHERE tx.organization_id = p_org_id
      AND tx.trip_id IN (SELECT trip_id FROM _vehicle_trips)
      AND COALESCE(tx.amount_out, 0) > 0
      -- Exclude driver compensation; that's reported on the driver tab.
      AND (tx.contact_type IS DISTINCT FROM 'driver')
      AND public.is_org_member(p_org_id)
    GROUP BY 1
  ),
  _monthly AS (
    SELECT
      to_char(date_trunc('month', vt.trip_date), 'YYYY-MM') AS period,
      SUM(COALESCE(vt.client_price, 0)  - COALESCE(vt.supplier_rate, 0)) AS gross_profit,
      SUM(COALESCE(vt.client_price, 0))  AS revenue,
      COUNT(*)                            AS trip_count,
      SUM(COALESCE(vt.distance, 0))      AS km_driven
    FROM _vehicle_trips vt
    GROUP BY 1
  )
  SELECT
    m.period,
    m.revenue                                            AS revenue,
    COALESCE(le.expense, 0)                              AS expense,
    m.revenue - COALESCE(le.expense, 0)                  AS profit,
    CASE WHEN m.revenue > 0
      THEN ROUND(((m.revenue - COALESCE(le.expense, 0)) / m.revenue) * 100, 2)
      ELSE 0
    END                                                  AS margin_pct,
    m.trip_count,
    m.km_driven
  FROM _monthly m
  LEFT JOIN _ledger_expense le ON le.period = m.period
  ORDER BY m.period ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_vehicle_monthly_analytics(uuid, uuid, int) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_driver_monthly_analytics(
  p_org_id      uuid,
  p_driver_id   uuid,
  p_months_back int DEFAULT 12
)
RETURNS TABLE (
  period       text,
  revenue      numeric,
  earnings     numeric,
  paid         numeric,
  trip_count   bigint,
  km_driven    numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH _period_start AS (
    SELECT date_trunc('month', now() - (p_months_back - 1 || ' months')::interval) AS start_dt
  ),
  _driver_trips AS (
    SELECT
      t.client_price,
      t.driver_commission,
      t.supplier_rate,
      t.distance,
      COALESCE(t.pickup_date, t.created_at) AS trip_date
    FROM public.trips t
    WHERE t.driver_id = p_driver_id
      AND t.organization_id = p_org_id
      AND COALESCE(t.pickup_date, t.created_at) >= (SELECT start_dt FROM _period_start)
      AND public.is_org_member(p_org_id)
  ),
  _driver_payments AS (
    SELECT
      to_char(date_trunc('month', COALESCE(tx.transaction_date, tx.created_at)::date), 'YYYY-MM') AS period,
      SUM(COALESCE(tx.amount_out, 0)) AS paid
    FROM public.transactions tx
    WHERE tx.contact_id = p_driver_id
      AND tx.organization_id = p_org_id
      AND tx.contact_type = 'driver'
      AND COALESCE(tx.amount_out, 0) > 0
      AND COALESCE(tx.transaction_date, tx.created_at::date) >= (SELECT start_dt FROM _period_start)
      AND public.is_org_member(p_org_id)
    GROUP BY 1
  ),
  _monthly AS (
    SELECT
      to_char(date_trunc('month', dt.trip_date), 'YYYY-MM') AS period,
      SUM(COALESCE(dt.client_price, 0))                     AS revenue,
      SUM(
        CASE
          WHEN dt.driver_commission IS NOT NULL AND dt.driver_commission > 0
            THEN dt.driver_commission
          WHEN dt.supplier_rate IS NOT NULL AND dt.supplier_rate > 0
            THEN dt.supplier_rate * 0.10
          ELSE COALESCE(dt.client_price, 0) * 0.10
        END
      )                                                    AS earnings,
      COUNT(*)                                             AS trip_count,
      SUM(COALESCE(dt.distance, 0))                        AS km_driven
    FROM _driver_trips dt
    GROUP BY 1
  )
  SELECT
    m.period, m.revenue, m.earnings,
    COALESCE(p.paid, 0) AS paid,
    m.trip_count, m.km_driven
  FROM _monthly m
  LEFT JOIN _driver_payments p ON p.period = m.period
  ORDER BY m.period ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_monthly_analytics(uuid, uuid, int) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Client monthly analytics — revenue, profitability, on-time,
--    payment-delay, outstanding, per month for a single client.
--
-- Margin is computed from `trips.margin` (GENERATED ALWAYS column).
-- Payment delay = days between earliest credit txn for the trip and the
-- trip's pickup_date. On-time % = trips with `completed_at::date <=
-- pickup_date + 1 day` over trips with both columns present.
-- Outstanding = sum of (client_price * exposure) - cash credited per month.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_client_monthly_analytics(
  p_org_id      uuid,
  p_client_id   uuid,
  p_months_back int DEFAULT 12
)
RETURNS TABLE (
  period                text,
  revenue               numeric,
  margin                numeric,
  margin_pct            numeric,
  trip_count            bigint,
  km_driven             numeric,
  collected             numeric,
  outstanding           numeric,
  avg_payment_delay_days numeric,
  on_time_pct           numeric,
  cancellation_rate_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH _period_start AS (
    SELECT date_trunc('month', now() - (p_months_back - 1 || ' months')::interval) AS start_dt
  ),
  _client_trips AS (
    SELECT
      t.id          AS trip_id,
      t.client_price,
      t.margin,
      t.distance,
      t.status,
      t.pickup_date,
      t.completed_at,
      COALESCE(t.pickup_date, t.created_at) AS trip_date
    FROM public.trips t
    WHERE t.client_id = p_client_id
      AND t.organization_id = p_org_id
      AND COALESCE(t.pickup_date, t.created_at) >= (SELECT start_dt FROM _period_start)
      AND public.is_org_member(p_org_id)
  ),
  _client_credits AS (
    SELECT
      to_char(date_trunc('month', COALESCE(tx.transaction_date, tx.created_at)::date), 'YYYY-MM') AS period,
      SUM(COALESCE(tx.amount_in, 0))                                AS collected,
      AVG(NULLIF(
        (COALESCE(tx.transaction_date, tx.created_at::date)
         - ct.pickup_date), 0
      ))                                                            AS avg_delay
    FROM public.transactions tx
    JOIN _client_trips ct ON ct.trip_id = tx.trip_id
    WHERE tx.organization_id = p_org_id
      AND COALESCE(tx.amount_in, 0) > 0
      AND ct.pickup_date IS NOT NULL
      AND public.is_org_member(p_org_id)
    GROUP BY 1
  ),
  _monthly AS (
    SELECT
      to_char(date_trunc('month', ct.trip_date), 'YYYY-MM') AS period,
      SUM(COALESCE(ct.client_price, 0))                     AS revenue,
      SUM(COALESCE(ct.margin, 0))                           AS margin,
      COUNT(*)                                              AS trip_count,
      SUM(COALESCE(ct.distance, 0))                         AS km_driven,
      -- On-time: completed within +1 day of pickup_date (proxy until SLA exists)
      AVG(
        CASE
          WHEN ct.completed_at IS NOT NULL AND ct.pickup_date IS NOT NULL
            THEN CASE
              WHEN ct.completed_at::date <= ct.pickup_date + INTERVAL '1 day'
                THEN 100.0
              ELSE 0.0
            END
          ELSE NULL
        END
      )                                                     AS on_time_pct,
      -- Cancellation rate
      ROUND(
        COUNT(*) FILTER (WHERE ct.status = 'cancelled')::numeric
        / NULLIF(COUNT(*), 0) * 100, 2
      )                                                     AS cancellation_rate_pct
    FROM _client_trips ct
    GROUP BY 1
  )
  SELECT
    m.period,
    m.revenue,
    m.margin,
    CASE WHEN m.revenue > 0
      THEN ROUND((m.margin / m.revenue) * 100, 2)
      ELSE 0
    END                                                     AS margin_pct,
    m.trip_count,
    m.km_driven,
    COALESCE(cc.collected, 0)                               AS collected,
    GREATEST(m.revenue - COALESCE(cc.collected, 0), 0)      AS outstanding,
    ROUND(COALESCE(cc.avg_delay, 0)::numeric, 1)            AS avg_payment_delay_days,
    ROUND(COALESCE(m.on_time_pct, 0)::numeric, 1)           AS on_time_pct,
    COALESCE(m.cancellation_rate_pct, 0)                    AS cancellation_rate_pct
  FROM _monthly m
  LEFT JOIN _client_credits cc ON cc.period = m.period
  ORDER BY m.period ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_monthly_analytics(uuid, uuid, int) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Supplier monthly analytics — trips handled, revenue, margin
--    contribution (margin = client_price - supplier_rate for trips where
--    we paid this supplier), settlement delay, outstanding.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_supplier_monthly_analytics(
  p_org_id      uuid,
  p_supplier_id uuid,
  p_months_back int DEFAULT 12
)
RETURNS TABLE (
  period                  text,
  revenue_handled         numeric,
  supplier_payable        numeric,
  margin_contribution     numeric,
  margin_contribution_pct numeric,
  trip_count              bigint,
  km_driven               numeric,
  paid                    numeric,
  outstanding             numeric,
  avg_settlement_days     numeric,
  on_time_pct             numeric,
  cancellation_rate_pct   numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH _period_start AS (
    SELECT date_trunc('month', now() - (p_months_back - 1 || ' months')::interval) AS start_dt
  ),
  _supplier_trips AS (
    SELECT
      t.id          AS trip_id,
      t.client_price,
      t.supplier_rate,
      t.margin,
      t.distance,
      t.status,
      t.pickup_date,
      t.completed_at,
      COALESCE(t.pickup_date, t.created_at) AS trip_date
    FROM public.trips t
    WHERE t.supplier_id = p_supplier_id
      AND t.organization_id = p_org_id
      AND COALESCE(t.pickup_date, t.created_at) >= (SELECT start_dt FROM _period_start)
      AND public.is_org_member(p_org_id)
  ),
  _supplier_payments AS (
    SELECT
      to_char(date_trunc('month', COALESCE(tx.transaction_date, tx.created_at)::date), 'YYYY-MM') AS period,
      SUM(COALESCE(tx.amount_out, 0))                                AS paid,
      AVG(NULLIF(
        (COALESCE(tx.transaction_date, tx.created_at::date)
         - st.pickup_date), 0
      ))                                                             AS avg_delay
    FROM public.transactions tx
    JOIN _supplier_trips st ON st.trip_id = tx.trip_id
    WHERE tx.organization_id = p_org_id
      AND tx.contact_type = 'supplier'
      AND COALESCE(tx.amount_out, 0) > 0
      AND st.pickup_date IS NOT NULL
      AND public.is_org_member(p_org_id)
    GROUP BY 1
  ),
  _monthly AS (
    SELECT
      to_char(date_trunc('month', st.trip_date), 'YYYY-MM') AS period,
      SUM(COALESCE(st.client_price, 0))                     AS revenue_handled,
      SUM(COALESCE(st.supplier_rate, 0))                    AS supplier_payable,
      SUM(COALESCE(st.margin, 0))                           AS margin_contribution,
      COUNT(*)                                              AS trip_count,
      SUM(COALESCE(st.distance, 0))                         AS km_driven,
      AVG(
        CASE
          WHEN st.completed_at IS NOT NULL AND st.pickup_date IS NOT NULL
            THEN CASE
              WHEN st.completed_at::date <= st.pickup_date + INTERVAL '1 day'
                THEN 100.0
              ELSE 0.0
            END
          ELSE NULL
        END
      )                                                     AS on_time_pct,
      ROUND(
        COUNT(*) FILTER (WHERE st.status = 'cancelled')::numeric
        / NULLIF(COUNT(*), 0) * 100, 2
      )                                                     AS cancellation_rate_pct
    FROM _supplier_trips st
    GROUP BY 1
  )
  SELECT
    m.period,
    m.revenue_handled,
    m.supplier_payable,
    m.margin_contribution,
    CASE WHEN m.revenue_handled > 0
      THEN ROUND((m.margin_contribution / m.revenue_handled) * 100, 2)
      ELSE 0
    END                                                       AS margin_contribution_pct,
    m.trip_count,
    m.km_driven,
    COALESCE(sp.paid, 0)                                      AS paid,
    GREATEST(m.supplier_payable - COALESCE(sp.paid, 0), 0)    AS outstanding,
    ROUND(COALESCE(sp.avg_delay, 0)::numeric, 1)              AS avg_settlement_days,
    ROUND(COALESCE(m.on_time_pct, 0)::numeric, 1)             AS on_time_pct,
    COALESCE(m.cancellation_rate_pct, 0)                      AS cancellation_rate_pct
  FROM _monthly m
  LEFT JOIN _supplier_payments sp ON sp.period = m.period
  ORDER BY m.period ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_monthly_analytics(uuid, uuid, int) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Score engines — server-side mirrors of the TS implementations in
--    `features/analytics/scores/*.util.ts`. Same weights; same `{ score,
--    level, sub-scores, breakdown }` shape. Use these for dashboard
--    aggregations / leaderboards where a list of 50+ entities would
--    otherwise N+1 the client.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 4a. Customer Health Score ───────────────────────────────────────────────
-- Composite: profitability 30% + payment-discipline 30% +
--            operational-efficiency 20% + business-consistency 10% +
--            growth 10%.
-- Window: last 6 months. Returns 0–100.

CREATE OR REPLACE FUNCTION public.compute_client_health_score(
  p_org_id    uuid,
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_revenue        numeric := 0;
  v_margin         numeric := 0;
  v_collected      numeric := 0;
  v_outstanding    numeric := 0;
  v_trips_total    int     := 0;
  v_trips_completed int    := 0;
  v_avg_delay      numeric := 0;
  v_distinct_months int    := 0;
  v_recent_revenue  numeric := 0;
  v_prior_revenue   numeric := 0;
  v_margin_pct     numeric := 0;
  v_profitability  numeric := 0;
  v_payment_score  numeric := 0;
  v_operations     numeric := 0;
  v_consistency    numeric := 0;
  v_growth         numeric := 0;
  v_score          int     := 0;
  v_level          text;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('score', 0, 'level', 'unknown');
  END IF;

  SELECT
    COALESCE(SUM(t.client_price), 0),
    COALESCE(SUM(t.margin), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE t.status = 'completed'),
    COUNT(DISTINCT date_trunc('month', COALESCE(t.pickup_date, t.created_at)))
  INTO v_revenue, v_margin, v_trips_total, v_trips_completed, v_distinct_months
  FROM public.trips t
  WHERE t.client_id = p_client_id
    AND t.organization_id = p_org_id
    AND COALESCE(t.pickup_date, t.created_at) >= now() - INTERVAL '6 months';

  SELECT
    COALESCE(SUM(tx.amount_in), 0),
    AVG(NULLIF((COALESCE(tx.transaction_date, tx.created_at::date) - t.pickup_date), 0))
  INTO v_collected, v_avg_delay
  FROM public.transactions tx
  JOIN public.trips t ON t.id = tx.trip_id
  WHERE t.client_id = p_client_id
    AND tx.organization_id = p_org_id
    AND COALESCE(tx.amount_in, 0) > 0
    AND t.pickup_date IS NOT NULL
    AND COALESCE(t.pickup_date, t.created_at) >= now() - INTERVAL '6 months';

  v_outstanding := GREATEST(v_revenue - v_collected, 0);

  SELECT COALESCE(SUM(client_price), 0) INTO v_recent_revenue
  FROM public.trips
  WHERE client_id = p_client_id AND organization_id = p_org_id
    AND COALESCE(pickup_date, created_at) >= now() - INTERVAL '3 months';

  SELECT COALESCE(SUM(client_price), 0) INTO v_prior_revenue
  FROM public.trips
  WHERE client_id = p_client_id AND organization_id = p_org_id
    AND COALESCE(pickup_date, created_at) >= now() - INTERVAL '6 months'
    AND COALESCE(pickup_date, created_at) <  now() - INTERVAL '3 months';

  v_margin_pct := CASE WHEN v_revenue > 0 THEN (v_margin / v_revenue) * 100 ELSE 0 END;

  -- Sub-scores (each 0–100).
  v_profitability := LEAST(GREATEST(v_margin_pct * 4, 0), 100);  -- 25%+ margin = full marks

  v_payment_score := CASE
    WHEN v_revenue = 0          THEN 100
    WHEN v_avg_delay IS NULL    THEN 80
    WHEN v_avg_delay <= 7       THEN 100
    WHEN v_avg_delay <= 15      THEN 85
    WHEN v_avg_delay <= 30      THEN 70
    WHEN v_avg_delay <= 45      THEN 55
    WHEN v_avg_delay <= 60      THEN 40
    ELSE 25
  END;

  v_operations := CASE
    WHEN v_trips_total = 0 THEN 100
    ELSE (v_trips_completed::numeric / v_trips_total) * 100
  END;

  v_consistency := LEAST(v_distinct_months * (100.0 / 6.0), 100);

  v_growth := CASE
    WHEN v_prior_revenue = 0 AND v_recent_revenue > 0 THEN 100
    WHEN v_prior_revenue = 0                          THEN 50
    ELSE LEAST(GREATEST(((v_recent_revenue - v_prior_revenue) / v_prior_revenue) * 100 + 50, 0), 100)
  END;

  v_score := ROUND(
      v_profitability * 0.30
    + v_payment_score * 0.30
    + v_operations    * 0.20
    + v_consistency   * 0.10
    + v_growth        * 0.10
  );

  v_level := CASE
    WHEN v_score >= 90 THEN 'excellent'
    WHEN v_score >= 70 THEN 'good'
    WHEN v_score >= 50 THEN 'warning'
    ELSE                    'critical'
  END;

  RETURN jsonb_build_object(
    'score',                v_score,
    'level',                v_level,
    'profitabilityScore',   ROUND(v_profitability),
    'paymentScore',         ROUND(v_payment_score),
    'operationsScore',      ROUND(v_operations),
    'consistencyScore',     ROUND(v_consistency),
    'growthScore',          ROUND(v_growth),
    'breakdown', jsonb_build_object(
      'revenue6m',         v_revenue,
      'margin6m',          v_margin,
      'marginPct',         ROUND(v_margin_pct, 2),
      'collected6m',       v_collected,
      'outstanding6m',     v_outstanding,
      'avgPaymentDelay',   ROUND(COALESCE(v_avg_delay, 0)::numeric, 1),
      'tripsTotal',        v_trips_total,
      'tripsCompleted',    v_trips_completed,
      'distinctMonths',    v_distinct_months,
      'recentRevenue',     v_recent_revenue,
      'priorRevenue',      v_prior_revenue
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_client_health_score(uuid, uuid) TO authenticated;


-- ── 4b. Supplier Reliability Score ──────────────────────────────────────────
-- Composite: completion-rate 30% + on-time 25% + cancellation 20% +
--            availability 15% + pricing-stability 10%.

CREATE OR REPLACE FUNCTION public.compute_supplier_reliability_score(
  p_org_id      uuid,
  p_supplier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trips_total      int     := 0;
  v_trips_completed  int     := 0;
  v_trips_cancelled  int     := 0;
  v_on_time          int     := 0;
  v_on_time_eligible int     := 0;
  v_distinct_months  int     := 0;
  v_rate_stddev      numeric := 0;
  v_rate_avg         numeric := 0;
  v_completion_pct   numeric := 0;
  v_cancellation_pct numeric := 0;
  v_on_time_pct      numeric := 0;
  v_completion_score numeric := 0;
  v_on_time_score    numeric := 0;
  v_cancel_score     numeric := 0;
  v_availability     numeric := 0;
  v_pricing_score    numeric := 0;
  v_score            int     := 0;
  v_level            text;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('score', 0, 'level', 'unknown');
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'cancelled'),
    COUNT(*) FILTER (
      WHERE completed_at IS NOT NULL
        AND pickup_date IS NOT NULL
        AND completed_at::date <= pickup_date + INTERVAL '1 day'
    ),
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND pickup_date IS NOT NULL),
    COUNT(DISTINCT date_trunc('month', COALESCE(pickup_date, created_at))),
    COALESCE(stddev_pop(supplier_rate) FILTER (WHERE supplier_rate > 0), 0),
    COALESCE(avg(supplier_rate)        FILTER (WHERE supplier_rate > 0), 0)
  INTO
    v_trips_total, v_trips_completed, v_trips_cancelled,
    v_on_time, v_on_time_eligible, v_distinct_months,
    v_rate_stddev, v_rate_avg
  FROM public.trips
  WHERE supplier_id = p_supplier_id
    AND organization_id = p_org_id
    AND COALESCE(pickup_date, created_at) >= now() - INTERVAL '6 months';

  v_completion_pct   := CASE WHEN v_trips_total > 0 THEN (v_trips_completed::numeric / v_trips_total) * 100 ELSE 0 END;
  v_cancellation_pct := CASE WHEN v_trips_total > 0 THEN (v_trips_cancelled::numeric / v_trips_total) * 100 ELSE 0 END;
  v_on_time_pct      := CASE WHEN v_on_time_eligible > 0 THEN (v_on_time::numeric / v_on_time_eligible) * 100 ELSE 0 END;

  v_completion_score := v_completion_pct;
  v_on_time_score    := v_on_time_pct;
  v_cancel_score     := GREATEST(100 - v_cancellation_pct * 4, 0);  -- 0% = 100, 25% = 0
  v_availability     := LEAST(v_distinct_months * (100.0 / 6.0), 100);
  v_pricing_score    := CASE
    WHEN v_rate_avg = 0 THEN 100
    ELSE LEAST(GREATEST(100 - (v_rate_stddev / v_rate_avg) * 200, 0), 100)
  END;

  v_score := ROUND(
      v_completion_score * 0.30
    + v_on_time_score    * 0.25
    + v_cancel_score     * 0.20
    + v_availability     * 0.15
    + v_pricing_score    * 0.10
  );

  v_level := CASE
    WHEN v_score >= 90 THEN 'excellent'
    WHEN v_score >= 70 THEN 'good'
    WHEN v_score >= 50 THEN 'warning'
    ELSE                    'critical'
  END;

  RETURN jsonb_build_object(
    'score',              v_score,
    'level',              v_level,
    'completionScore',    ROUND(v_completion_score),
    'onTimeScore',        ROUND(v_on_time_score),
    'cancellationScore',  ROUND(v_cancel_score),
    'availabilityScore',  ROUND(v_availability),
    'pricingScore',       ROUND(v_pricing_score),
    'breakdown', jsonb_build_object(
      'tripsTotal',       v_trips_total,
      'tripsCompleted',   v_trips_completed,
      'tripsCancelled',   v_trips_cancelled,
      'onTime',           v_on_time,
      'onTimeEligible',   v_on_time_eligible,
      'completionPct',    ROUND(v_completion_pct, 2),
      'cancellationPct',  ROUND(v_cancellation_pct, 2),
      'onTimePct',        ROUND(v_on_time_pct, 2),
      'distinctMonths',   v_distinct_months,
      'rateStddev',       ROUND(v_rate_stddev, 2),
      'rateAvg',          ROUND(v_rate_avg, 2)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_supplier_reliability_score(uuid, uuid) TO authenticated;


-- ── 4c. Driver Performance Score ────────────────────────────────────────────
-- Composite: settlement-health 30% + completion 25% + on-time 20% +
--            productivity 15% + ratings 10%.
-- Settlement health = paid / earnings (clamped 0..100).
-- Productivity      = trips/month * 5 (clamped to 100).
-- Ratings           = avg star rating * 20 (0..100).

CREATE OR REPLACE FUNCTION public.compute_driver_performance_score(
  p_org_id    uuid,
  p_driver_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trips_total     int     := 0;
  v_trips_completed int     := 0;
  v_on_time         int     := 0;
  v_on_time_eligible int    := 0;
  v_revenue         numeric := 0;
  v_earnings        numeric := 0;
  v_paid            numeric := 0;
  v_distinct_months int     := 0;
  v_avg_rating      numeric := 0;
  v_rating_count    int     := 0;
  v_completion_pct  numeric := 0;
  v_on_time_pct     numeric := 0;
  v_settlement      numeric := 0;
  v_productivity    numeric := 0;
  v_ratings_score   numeric := 0;
  v_score           int     := 0;
  v_level           text;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('score', 0, 'level', 'unknown');
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (
      WHERE completed_at IS NOT NULL
        AND pickup_date IS NOT NULL
        AND completed_at::date <= pickup_date + INTERVAL '1 day'
    ),
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND pickup_date IS NOT NULL),
    COALESCE(SUM(client_price), 0),
    COALESCE(SUM(
      CASE
        WHEN driver_commission IS NOT NULL AND driver_commission > 0 THEN driver_commission
        WHEN supplier_rate     IS NOT NULL AND supplier_rate > 0     THEN supplier_rate * 0.10
        ELSE COALESCE(client_price, 0) * 0.10
      END
    ), 0),
    COUNT(DISTINCT date_trunc('month', COALESCE(pickup_date, created_at)))
  INTO
    v_trips_total, v_trips_completed, v_on_time, v_on_time_eligible,
    v_revenue, v_earnings, v_distinct_months
  FROM public.trips
  WHERE driver_id = p_driver_id
    AND organization_id = p_org_id
    AND COALESCE(pickup_date, created_at) >= now() - INTERVAL '6 months';

  SELECT COALESCE(SUM(amount_out), 0)
  INTO v_paid
  FROM public.transactions
  WHERE contact_id = p_driver_id
    AND contact_type = 'driver'
    AND organization_id = p_org_id
    AND COALESCE(amount_out, 0) > 0
    AND COALESCE(transaction_date, created_at::date) >= (now() - INTERVAL '6 months')::date;

  -- Ratings — `driver_ratings` table may or may not exist depending on
  -- the org's history; guard via a soft try/catch.
  BEGIN
    SELECT COALESCE(AVG(rating), 0), COUNT(*)
    INTO   v_avg_rating, v_rating_count
    FROM   public.driver_ratings
    WHERE  driver_id = p_driver_id;
  EXCEPTION
    WHEN undefined_table THEN
      v_avg_rating := 0;
      v_rating_count := 0;
  END;

  v_completion_pct := CASE WHEN v_trips_total > 0 THEN (v_trips_completed::numeric / v_trips_total) * 100 ELSE 0 END;
  v_on_time_pct    := CASE WHEN v_on_time_eligible > 0 THEN (v_on_time::numeric / v_on_time_eligible) * 100 ELSE 0 END;
  v_settlement     := CASE WHEN v_earnings > 0 THEN LEAST((v_paid / v_earnings) * 100, 100) ELSE 100 END;
  v_productivity   := LEAST(
    CASE WHEN v_distinct_months > 0
      THEN (v_trips_total::numeric / v_distinct_months) * 5
      ELSE 0
    END,
    100
  );
  v_ratings_score  := CASE WHEN v_rating_count > 0 THEN LEAST(v_avg_rating * 20, 100) ELSE 70 END;

  v_score := ROUND(
      v_settlement      * 0.30
    + v_completion_pct  * 0.25
    + v_on_time_pct     * 0.20
    + v_productivity    * 0.15
    + v_ratings_score   * 0.10
  );

  v_level := CASE
    WHEN v_score >= 90 THEN 'excellent'
    WHEN v_score >= 70 THEN 'good'
    WHEN v_score >= 50 THEN 'warning'
    ELSE                    'critical'
  END;

  RETURN jsonb_build_object(
    'score',           v_score,
    'level',           v_level,
    'settlementScore', ROUND(v_settlement),
    'completionScore', ROUND(v_completion_pct),
    'onTimeScore',     ROUND(v_on_time_pct),
    'productivityScore', ROUND(v_productivity),
    'ratingsScore',    ROUND(v_ratings_score),
    'breakdown', jsonb_build_object(
      'tripsTotal',     v_trips_total,
      'tripsCompleted', v_trips_completed,
      'onTime',         v_on_time,
      'onTimeEligible', v_on_time_eligible,
      'revenue6m',      v_revenue,
      'earnings6m',     v_earnings,
      'paid6m',         v_paid,
      'distinctMonths', v_distinct_months,
      'avgRating',      ROUND(v_avg_rating, 2),
      'ratingCount',    v_rating_count
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_driver_performance_score(uuid, uuid) TO authenticated;
