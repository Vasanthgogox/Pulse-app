-- =============================================================================
-- Vehicle Performance Score — composite 0..100 RPC.
-- =============================================================================
--
-- Symmetric with `compute_driver_performance_score`,
-- `compute_supplier_reliability_score`, `compute_client_health_score`.
-- Used by:
--   • <VehicleIntelligenceSection> — single-vehicle drill-down.
--   • <VehicleFleetRankingTab>     — fleet-wide leaderboard.
-- The TypeScript engine in
-- `features/analytics/scores/vehiclePerformanceScore.util.ts` mirrors this
-- logic; keep weights / window in lockstep if you tune one.
--
-- Composite:
--   profitability    30%   margin % over window (clamped 0..100)
--   utilization      25%   distinct active months / window months
--   completion       20%   completed / total trips
--   cost-efficiency  15%   100 - operating-expense-ratio (clamped)
--   consistency      10%   1 - CV(trips per month) → favour even cadence
--
-- Window: last 6 months from now() (matches the other score RPCs).
-- Returns `{ score, level, *Score, breakdown }`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_vehicle_performance_score(
  p_org_id     uuid,
  p_vehicle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trips_total       int     := 0;
  v_trips_completed   int     := 0;
  v_trips_cancelled   int     := 0;
  v_revenue           numeric := 0;
  v_expense           numeric := 0;
  v_distance          numeric := 0;
  v_distinct_months   int     := 0;
  v_trips_stddev      numeric := 0;
  v_trips_avg         numeric := 0;
  v_completion_pct    numeric := 0;
  v_margin_pct        numeric := 0;
  v_expense_ratio     numeric := 0;
  v_profitability     numeric := 0;
  v_utilization       numeric := 0;
  v_cost_efficiency   numeric := 0;
  v_consistency       numeric := 0;
  v_score             int     := 0;
  v_level             text;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('score', 0, 'level', 'unknown');
  END IF;

  -- 1. Trip aggregate metrics restricted to vehicle + window.
  WITH _vehicle_trips AS (
    SELECT
      t.id,
      t.client_price,
      t.supplier_rate,
      t.status,
      t.distance,
      COALESCE(t.pickup_date, t.created_at) AS trip_date
    FROM public.trips t
    WHERE t.vehicle_id = p_vehicle_id
      AND t.organization_id = p_org_id
      AND COALESCE(t.pickup_date, t.created_at) >= now() - INTERVAL '6 months'
  ),
  _per_month AS (
    SELECT
      date_trunc('month', trip_date) AS m,
      COUNT(*)::int                  AS month_trips
    FROM _vehicle_trips
    GROUP BY 1
  )
  SELECT
    COALESCE((SELECT COUNT(*) FROM _vehicle_trips), 0),
    COALESCE((SELECT COUNT(*) FROM _vehicle_trips WHERE status = 'completed'), 0),
    COALESCE((SELECT COUNT(*) FROM _vehicle_trips WHERE status = 'cancelled'), 0),
    COALESCE((SELECT SUM(client_price) FROM _vehicle_trips), 0),
    COALESCE((SELECT SUM(distance) FROM _vehicle_trips), 0),
    COALESCE((SELECT COUNT(*) FROM _per_month), 0),
    COALESCE((SELECT stddev_pop(month_trips) FROM _per_month), 0),
    COALESCE((SELECT avg(month_trips) FROM _per_month), 0)
  INTO
    v_trips_total, v_trips_completed, v_trips_cancelled,
    v_revenue, v_distance, v_distinct_months,
    v_trips_stddev, v_trips_avg;

  -- 2. Expense (excluding driver compensation — matches monthly RPC).
  SELECT COALESCE(SUM(tx.amount_out), 0)
  INTO v_expense
  FROM public.transactions tx
  JOIN public.trips t ON t.id = tx.trip_id
  WHERE t.vehicle_id = p_vehicle_id
    AND t.organization_id = p_org_id
    AND tx.amount_out > 0
    AND (tx.contact_type IS DISTINCT FROM 'driver')
    AND COALESCE(t.pickup_date, t.created_at) >= now() - INTERVAL '6 months';

  -- 3. Sub-score computation.
  v_completion_pct := CASE WHEN v_trips_total > 0
    THEN (v_trips_completed::numeric / v_trips_total) * 100 ELSE 0 END;
  v_margin_pct := CASE WHEN v_revenue > 0
    THEN ((v_revenue - v_expense) / v_revenue) * 100 ELSE 0 END;
  v_expense_ratio := CASE WHEN v_revenue > 0
    THEN (v_expense / v_revenue) * 100 ELSE 0 END;

  -- Profitability: clamp margin% to 0..100 (negative margins floor to 0).
  v_profitability := LEAST(GREATEST(v_margin_pct, 0), 100);

  -- Utilization: months with trips / total months in window (max 6).
  v_utilization := LEAST(v_distinct_months * (100.0 / 6.0), 100);

  -- Cost efficiency: 100 - expense_ratio, clamped (so 50% expense ratio → 50).
  v_cost_efficiency := LEAST(GREATEST(100 - v_expense_ratio, 0), 100);

  -- Consistency: 100 - (CV × 100), clamped. Even cadence → high score.
  v_consistency := CASE
    WHEN v_trips_avg = 0 THEN 0
    ELSE LEAST(GREATEST(100 - (v_trips_stddev / v_trips_avg) * 100, 0), 100)
  END;

  v_score := ROUND(
      v_profitability   * 0.30
    + v_utilization     * 0.25
    + v_completion_pct  * 0.20
    + v_cost_efficiency * 0.15
    + v_consistency     * 0.10
  );

  v_level := CASE
    WHEN v_trips_total = 0 THEN 'unknown'
    WHEN v_score >= 90     THEN 'excellent'
    WHEN v_score >= 70     THEN 'good'
    WHEN v_score >= 50     THEN 'warning'
    ELSE                        'critical'
  END;

  RETURN jsonb_build_object(
    'score',              v_score,
    'level',              v_level,
    'profitabilityScore', ROUND(v_profitability),
    'utilizationScore',   ROUND(v_utilization),
    'completionScore',    ROUND(v_completion_pct),
    'costEfficiencyScore',ROUND(v_cost_efficiency),
    'consistencyScore',   ROUND(v_consistency),
    'breakdown', jsonb_build_object(
      'tripsTotal',       v_trips_total,
      'tripsCompleted',   v_trips_completed,
      'tripsCancelled',   v_trips_cancelled,
      'revenue',          ROUND(v_revenue, 2),
      'expense',          ROUND(v_expense, 2),
      'profit',           ROUND(v_revenue - v_expense, 2),
      'marginPct',        ROUND(v_margin_pct, 2),
      'expenseRatio',     ROUND(v_expense_ratio, 2),
      'distance',         ROUND(v_distance, 2),
      'distinctMonths',   v_distinct_months,
      'tripsPerMonthAvg', ROUND(v_trips_avg, 2),
      'tripsPerMonthCv',  CASE WHEN v_trips_avg > 0 THEN ROUND(v_trips_stddev / v_trips_avg, 3) ELSE 0 END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_vehicle_performance_score(uuid, uuid) TO authenticated;
