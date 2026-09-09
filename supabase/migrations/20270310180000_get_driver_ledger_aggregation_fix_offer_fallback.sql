-- Phase 6c.1 correction, caught by C3 fixture-building against a real org
-- (nihas logs) before any TS cutover: 20270310130000's driver_offer CTE used
-- an unconditional LEFT JOIN from drivers to driver_invites, so
-- coalesce(di.commission_percent, d.commission_percent) fell back to the
-- driver's OWN commission_percent/commission_per_km whenever no accepted
-- invite matched -- including when NO accepted invite row exists for that
-- driver at all.
--
-- getDriverOffersByOrganization (features/drivers/services/drivers.service.ts:1702-1753)
-- does not do this: it iterates the fetched `invites` rows and only ever sets
-- offersByDriverId[driver.id] for a driver whose user_id matched some accepted
-- invite row. The drivers-table fallback (`num(r.x) ?? num(driver.x)`) only
-- fires for a driver that HAS a matching invite row whose own fields are
-- null -- never for a driver with zero accepted invites, no matter what its
-- own commission_percent/commission_per_km columns hold. A driver with
-- terms set directly on `drivers` but no accepted invite therefore falls
-- through to trip.driver_commission in production today, not to those columns.
--
-- Confirmed live and non-hypothetical on the linked project: org
-- 89427247-b09c-444b-ac85-17c1bf9fdf20 ("nihas logs") has a driver
-- ("aiman", commission_percent=5, payable_amount=5000 on the drivers row)
-- with zero accepted invites addressed to their user_id -- the org's one
-- accepted invite belongs to a different user entirely. The previous
-- version of this RPC would have applied aiman's 5% to their trips; real
-- production code never would.
--
-- Fix: driver_offer is now built FROM driver_invites (INNER JOIN drivers),
-- so a row only exists for a driver with at least one matching accepted
-- invite -- the coalesce-to-drivers-columns fallback still applies within
-- that row (matching the "invite exists but lacks terms" case), it just no
-- longer manufactures a row when no invite exists. driver_due's own LEFT
-- JOIN to driver_offer is unchanged: a driver absent from driver_offer
-- correctly falls through to trip.driver_commission via the existing CASE.

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
