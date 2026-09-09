-- Phase 6c.2 correction: get_supplier_ledger_aggregation (20270310140000) shipped
-- with no awareness of trip_finance_adjustments at all, but aggregateSuppliers.ts's
-- real production caller (FinanceScreen.tsx) always passes adjustmentsByTripId (the
-- 6-arg call), which routes every own-trip due amount through adjustedCost(rawRate, adj)
-- before summing. Confirmed live and non-dormant: the linked project currently has 16
-- active trip_finance_adjustments rows (13 cost/minus, 3 cost/plus) that were silently
-- unrepresented in the first version of this RPC. This migration supersedes 140000's
-- function body; it does not touch 140000's file (already applied) so both remain
-- independently reviewable in history.
--
-- Two distinct adjustment types apply on two distinct branches, per tripAdjustments.ts's
-- own header ("revenue (sales) or cost (supplier)") and aggregateSuppliers.ts's actual
-- calls:
--  - own_trip_cost (a trip this supplier hauled for us): adjustedCost, type='cost' --
--    the same trip's cost-side adjustment the supplier's own bill would reflect.
--  - as_client_cost (a trip where we are the client of an integrated supplier, priced
--    from the trip OWNER's client_price/supplier_rate): adjustedRevenue, type='revenue' --
--    the trip owner's billing-side adjustment, since that determines what we, as their
--    client, actually owe. This is not a mistake to reconcile with own_trip_cost's
--    'cost' type -- aggregateSuppliers.ts calls adjustedCost on one branch and
--    adjustedRevenue on the other, and this SQL reproduces exactly that, not a single
--    unified adjustment type across both.
--
-- p_apply_adjustments mirrors get_customer_ledger_inputs's own parameter -- callers
-- choose, matching aggregateSuppliers.ts's `adjustmentsByTripId !== undefined` branch
-- (both real FinanceScreen.tsx call sites currently pass adjustments for suppliers, but
-- the RPC does not hardcode that as the only possible caller behavior).
--
-- adjustedCost/adjustedRevenue both clamp to greatest(0, base + delta) and exclude
-- voided_at IS NOT NULL rows (soft-void) -- reproduced exactly, not approximated.

DROP FUNCTION IF EXISTS public.get_supplier_ledger_aggregation(uuid);

CREATE OR REPLACE FUNCTION public.get_supplier_ledger_aggregation(p_org_id uuid, p_apply_adjustments boolean DEFAULT true)
RETURNS TABLE (
  supplier_id uuid,
  trips_count integer,
  due numeric,
  paid numeric,
  unsettled numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH supplier_linked_org_index AS (
    -- Mirrors buildUniqueLinkedOrgIdMap (features/trips/visibility/tripVisibility.ts),
    -- whose name states the invariant this CTE enforces explicitly: at most
    -- one supplier per linked_organization_id. Without this, two suppliers
    -- linked to the same external org would multiply as_client_cost's rows.
    SELECT DISTINCT ON (linked_organization_id)
      linked_organization_id, id AS supplier_id
    FROM public.suppliers
    WHERE organization_id = p_org_id AND linked_organization_id IS NOT NULL
    ORDER BY linked_organization_id, id ASC
  ),
  trip_supplier_resolution AS (
    -- Exactly one row per trip, resolved via supplier_id only -- see the
    -- "Supplier name fallback intentionally omitted" note in 20270310140000.
    SELECT
      t.id AS trip_id,
      t.trip_number,
      t.supplier_rate,
      s_id.id AS supplier_id
    FROM public.trips t
    LEFT JOIN public.suppliers s_id
      ON s_id.id = t.supplier_id AND s_id.organization_id = p_org_id
    WHERE t.organization_id = p_org_id
  ),
  trip_cost_adjustments AS (
    SELECT trip_id, sum(CASE WHEN impact = 'plus' THEN amount ELSE -amount END) AS delta
    FROM public.trip_finance_adjustments
    WHERE type = 'cost' AND voided_at IS NULL
    GROUP BY trip_id
  ),
  trip_revenue_adjustments AS (
    SELECT trip_id, sum(CASE WHEN impact = 'plus' THEN amount ELSE -amount END) AS delta
    FROM public.trip_finance_adjustments
    WHERE type = 'revenue' AND voided_at IS NULL
    GROUP BY trip_id
  ),
  own_trip_cost AS (
    SELECT
      tsr.supplier_id,
      count(*)::int AS trips_count,
      sum(
        CASE WHEN p_apply_adjustments
          THEN greatest(0, coalesce(tsr.supplier_rate, 0) + coalesce(tca.delta, 0))
          ELSE coalesce(tsr.supplier_rate, 0)
        END
      ) AS due
    FROM trip_supplier_resolution tsr
    LEFT JOIN trip_cost_adjustments tca ON tca.trip_id = tsr.trip_id
    WHERE tsr.supplier_id IS NOT NULL
    GROUP BY tsr.supplier_id
  ),
  as_client_cost AS (
    SELECT
      sloi.supplier_id,
      count(*)::int AS trips_count,
      sum(
        CASE WHEN p_apply_adjustments
          THEN greatest(0, coalesce(t.client_price, t.supplier_rate, 0) + coalesce(tra.delta, 0))
          ELSE coalesce(t.client_price, t.supplier_rate, 0)
        END
      ) AS due
    FROM public.trips t
    JOIN public.clients c ON c.id = t.client_id
    JOIN supplier_linked_org_index sloi ON sloi.linked_organization_id = t.organization_id
    LEFT JOIN trip_revenue_adjustments tra ON tra.trip_id = t.id
    WHERE c.linked_organization_id = p_org_id
      AND t.indent_id IS NOT NULL
    GROUP BY sloi.supplier_id
  ),
  supplier_trip_ids_by_number AS (
    -- (organization_id, trip_number) is a real unique constraint, so this
    -- matches at most one supplier per trip_number.
    SELECT trip_number, supplier_id
    FROM trip_supplier_resolution
    WHERE trip_number IS NOT NULL AND supplier_id IS NOT NULL
  ),
  supplier_paid AS (
    SELECT
      coalesce(s_direct.id, sti.supplier_id, stn.supplier_id) AS supplier_id,
      sum(tx.amount_out) AS paid
    FROM public.transactions tx
    LEFT JOIN public.suppliers s_direct
      ON s_direct.id = tx.contact_id AND s_direct.organization_id = p_org_id AND tx.contact_type = 'supplier'
    LEFT JOIN trip_supplier_resolution sti
      ON sti.trip_id = tx.trip_id AND s_direct.id IS NULL
    LEFT JOIN supplier_trip_ids_by_number stn
      ON s_direct.id IS NULL AND sti.supplier_id IS NULL
     AND stn.trip_number = public.extract_ledger_meta_trip_number(tx.description)
    WHERE tx.organization_id = p_org_id
      AND coalesce(tx.amount_out, 0) > 0
      AND (s_direct.id IS NOT NULL OR sti.supplier_id IS NOT NULL OR stn.supplier_id IS NOT NULL)
    GROUP BY coalesce(s_direct.id, sti.supplier_id, stn.supplier_id)
  )
  SELECT
    s.id AS supplier_id,
    coalesce(otc.trips_count, 0) + coalesce(acc.trips_count, 0) AS trips_count,
    coalesce(otc.due, 0) + coalesce(acc.due, 0) AS due,
    coalesce(sp.paid, 0) AS paid,
    greatest(0, (coalesce(otc.due, 0) + coalesce(acc.due, 0)) - coalesce(sp.paid, 0)) AS unsettled
  FROM public.suppliers s
  LEFT JOIN own_trip_cost otc ON otc.supplier_id = s.id
  LEFT JOIN as_client_cost acc ON acc.supplier_id = s.id
  LEFT JOIN supplier_paid sp ON sp.supplier_id = s.id
  WHERE s.organization_id = p_org_id
    AND public.is_org_member(p_org_id);
$function$;

REVOKE ALL ON FUNCTION public.get_supplier_ledger_aggregation(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supplier_ledger_aggregation(uuid, boolean) TO authenticated;
