-- DCO-6 Phase 3, commit 2/6: DCO due/paid/outstanding aggregation.
--
-- Additive, net-new function -- does not modify get_supplier_ledger_aggregation,
-- get_driver_ledger_aggregation (beyond the already-separate 20270310260000
-- fix), get_customer_ledger_inputs, or any Finance C2.5 function.
--
-- Architecture (locked in DCO-6 Phase 2 design review):
--   due    = SUM(trips.supplier_rate) WHERE operating_mode='DCO'
--            AND dco_payee_id IS NOT NULL AND organization_id = p_org_id
--   paid   = SUM(transactions.amount_out) WHERE contact_type='dco'
--            AND contact_id = dco_payees.id AND organization_id = p_org_id
--   outstanding = GREATEST(due - paid, 0)
--
-- dco_payees has NO organization_id column (a DCO is a global, person-owned
-- identity, not "org X's own record of them" -- unlike suppliers, which IS
-- org-owned). So this cannot anchor on `dco_payees WHERE organization_id=
-- p_org_id` the way get_supplier_ledger_aggregation anchors on suppliers --
-- there is no such column to filter on. Instead the org boundary is derived
-- entirely from the trips filter: dco_due (already scoped to p_org_id) is
-- the anchor, INNER JOINed outward to dco_payees for identity fields. A
-- payee with zero trips in this org is correctly absent from the result.
--
-- Payment matching intentionally has no trip-level itemization -- due and
-- paid are independent sums, exactly mirroring supplier_paid's own
-- contact-level (not trip-level) matching (verified in the Phase 2 payment-
-- semantics trace: an unrelated supplier transaction counts toward "paid"
-- in full today, with no linkage check -- DCO inherits the identical,
-- already-accepted behavior, not a new gap).

CREATE OR REPLACE FUNCTION public.get_dco_ledger_aggregation(p_org_id uuid)
RETURNS TABLE (
  dco_payee_id uuid,
  dco_user_id uuid,
  trips_count integer,
  due numeric,
  paid numeric,
  outstanding numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH dco_due AS (
    SELECT
      t.dco_payee_id,
      count(*)::int AS trips_count,
      sum(coalesce(t.supplier_rate, 0)) AS due
    FROM public.trips t
    WHERE t.organization_id = p_org_id
      AND t.operating_mode = 'DCO'
      AND t.dco_payee_id IS NOT NULL
    GROUP BY t.dco_payee_id
  ),
  dco_paid AS (
    SELECT
      tx.contact_id AS dco_payee_id,
      sum(tx.amount_out) AS paid
    FROM public.transactions tx
    WHERE tx.organization_id = p_org_id
      AND tx.contact_type = 'dco'
      AND tx.contact_id IS NOT NULL
      AND coalesce(tx.amount_out, 0) > 0
    GROUP BY tx.contact_id
  )
  SELECT
    dp.id AS dco_payee_id,
    dp.user_id AS dco_user_id,
    dd.trips_count,
    dd.due,
    coalesce(dpaid.paid, 0) AS paid,
    greatest(0, dd.due - coalesce(dpaid.paid, 0)) AS outstanding
  FROM dco_due dd
  JOIN public.dco_payees dp ON dp.id = dd.dco_payee_id
  LEFT JOIN dco_paid dpaid ON dpaid.dco_payee_id = dp.id
  WHERE public.is_org_member(p_org_id);
$function$;

REVOKE ALL ON FUNCTION public.get_dco_ledger_aggregation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dco_ledger_aggregation(uuid) TO authenticated;
