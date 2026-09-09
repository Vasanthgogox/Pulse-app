-- DCO-6 Phase 3, commit 1/6: narrow, isolated fix, independently reviewable
-- from the rest of DCO-6.
--
-- get_driver_ledger_aggregation's driver_due CTE (20270310180000) keys off
-- `t.driver_id IS NOT NULL`, with no operating_mode filter. Every DCO trip
-- carries a real trips.driver_id (created by _resolve_or_create_market_driver
-- in the awarding org, purely so the trip row satisfies its own driver_id
-- invariant), so DCO trips are picked up here too -- contributing
-- trips_count += 1, due += coalesce(driver_commission, 0) = 0 (a DCO trip's
-- driver_commission is always 0 by DCO-4 design). Confirmed live against the
-- one real DCO trip in production (TRP037, org dc771ec3...): its synthetic
-- "A10 Pilot DCO" driver row currently shows trips_count=1, due=0.00,
-- paid=0, pending=0 in that org's Drivers tab -- a phantom, zero-value but
-- confusing row.
--
-- This is not a DCO-4 defect and not new DCO-6 scope: it's a pre-existing
-- driver-ledger quirk that any market-mode trip with a resolved driver_id
-- and zero driver_commission would already trigger; DCO trips just
-- guarantee the pattern every time. Fixed as its own commit, ahead of and
-- independent from the rest of DCO-6, so it stays separately reversible.
--
-- Body copied verbatim from 20270310180000_get_driver_ledger_aggregation_fix_offer_fallback.sql
-- except for the single added condition on driver_due's WHERE clause.

CREATE OR REPLACE FUNCTION public.get_driver_ledger_aggregation(p_org_id uuid)
RETURNS TABLE (
  driver_id uuid,
  trips_count integer,
  due numeric,
  paid numeric,
  pending numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH driver_offer AS (
    SELECT DISTINCT ON (di.to_user_id)
      d.id AS driver_id,
      coalesce(di.commission_percent, d.commission_percent) AS commission_percent,
      coalesce(di.commission_per_km, d.commission_per_km) AS commission_per_km
    FROM public.driver_invites di
    JOIN public.drivers d ON d.user_id = di.to_user_id AND d.organization_id = p_org_id
    WHERE di.from_organization_id = p_org_id AND di.status = 'accepted'
    ORDER BY di.to_user_id, di.created_at DESC
  ),
  driver_due AS (
    SELECT
      t.driver_id,
      count(*)::int AS trips_count,
      sum(
        CASE
          WHEN o.commission_percent IS NOT NULL AND o.commission_percent >= 0 AND coalesce(t.client_price, 0) > 0
            THEN coalesce(t.client_price, 0) * o.commission_percent / 100
          WHEN o.commission_per_km IS NOT NULL AND o.commission_per_km >= 0
               AND t.distance IS NOT NULL AND t.distance > 0
            THEN t.distance * o.commission_per_km
          ELSE coalesce(t.driver_commission, 0)
        END
      ) AS due
    FROM public.trips t
    LEFT JOIN driver_offer o ON o.driver_id = t.driver_id
    WHERE t.organization_id = p_org_id AND t.driver_id IS NOT NULL
      AND t.operating_mode <> 'DCO'
    GROUP BY t.driver_id
  ),
  driver_paid AS (
    SELECT tx.contact_id AS driver_id, sum(tx.amount_out) AS paid
    FROM public.transactions tx
    WHERE tx.organization_id = p_org_id
      AND tx.contact_type = 'driver'
      AND tx.contact_id IS NOT NULL
      AND coalesce(tx.amount_out, 0) > 0
    GROUP BY tx.contact_id
  )
  SELECT
    d.id AS driver_id,
    coalesce(dd.trips_count, 0) AS trips_count,
    coalesce(dd.due, 0) AS due,
    coalesce(dp.paid, 0) AS paid,
    greatest(0, coalesce(dd.due, 0) - coalesce(dp.paid, 0)) AS pending
  FROM public.drivers d
  LEFT JOIN driver_due dd ON dd.driver_id = d.id
  LEFT JOIN driver_paid dp ON dp.driver_id = d.id
  WHERE d.organization_id = p_org_id
    AND public.is_org_member(p_org_id);
$function$;

REVOKE ALL ON FUNCTION public.get_driver_ledger_aggregation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_ledger_aggregation(uuid) TO authenticated;
