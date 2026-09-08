-- Phase 6c.1: server-side, unbounded equivalent of aggregateDrivers.ts's O(n)
-- JS reduce. Ports computeDriverCommissionForTrip's exact fallback chain
-- (offer commission_percent * client_price -> offer commission_per_km *
-- distance -> trip's own stamped driver_commission -> 0; NEVER a guess from
-- supplier_rate) and the "paid restricted to contact_type='driver'" rule.
--
-- Anti-fan-out: driver_due and driver_paid are each collapsed to one row per
-- driver_id in their own CTE before being joined at the end. A single query
-- joining trips to transactions directly and GROUPing by driver_id would
-- multiply due by the transaction count for that driver (1 trip x 5
-- transactions = commission counted 5 times) -- this structure prevents that
-- by construction, not by convention.
--
-- getDriverOffersByOrganization's actual source (traced from
-- features/drivers/services/drivers.service.ts:1702-1750) is NOT a
-- driver_offers table -- it's driver_invites (to_user_id = driver.user_id,
-- from_organization_id = org, status = 'accepted'), falling back to the
-- drivers row's own payable_amount/commission_percent/commission_per_km
-- columns when the invite lacks them. Ported exactly, including the
-- fallback direction. Note: if a driver somehow has more than one accepted
-- invite (no uniqueness constraint prevents this), the current JS code's
-- choice among them is already order-dependent (no ORDER BY in that query,
-- last one wins via object-key overwrite) -- this RPC picks the most
-- recently created accepted invite, a reasonable deterministic choice for
-- an already-arbitrary edge case, not a behavior change for the normal
-- single-invite case.

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
    SELECT DISTINCT ON (d.id)
      d.id AS driver_id,
      coalesce(di.commission_percent, d.commission_percent) AS commission_percent,
      coalesce(di.commission_per_km, d.commission_per_km) AS commission_per_km
    FROM public.drivers d
    LEFT JOIN public.driver_invites di
      ON di.to_user_id = d.user_id
     AND di.from_organization_id = p_org_id
     AND di.status = 'accepted'
    WHERE d.organization_id = p_org_id
    ORDER BY d.id, di.created_at DESC NULLS LAST
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
