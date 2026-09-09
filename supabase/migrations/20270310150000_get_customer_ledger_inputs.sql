-- Phase 6c.3: unbounded INPUT PREPARATION for aggregateCustomers.ts's
-- allocateAmountsToLargestDueTrips step. This function does NOT allocate
-- anything -- it produces the same three inputs the JS function currently
-- derives from a 400/500-row-capped fetch, over the complete dataset, so the
-- existing (unchanged) allocator in TypeScript can run on correct data.
--
-- p_apply_adjustments encodes the real, traced discrepancy between the two
-- FinanceScreen.tsx call sites: the card-metrics call omits
-- adjustmentsByTripId (4 args), the roster-report call includes it (5 args).
-- This is a parameter, not a hardcoded policy -- callers choose, matching
-- today's behavior exactly.
--
-- Payment ordering: getTransactionsByOrganization's actual query (traced
-- live) orders by transaction_date DESC, created_at DESC -- NOT ascending
-- chronological. The allocator processes the transactions array in exactly
-- that order, so unlinked_payments is ordered identically here. A third key
-- (id) is added purely to break ties the original two-key order left
-- undefined -- it cannot change the relative order of any pair the current
-- query already orders deterministically.
--
-- Known documented assumptions (to be verified empirically in equivalence
-- testing before cutover, not silently treated as certain):
--  - transactions.trip_number does not exist on the live schema (confirmed);
--    the JS's trip-number fallback branch is therefore dead code against
--    real rows and is not ported.
--  - If two clients in the same org share an identical normalized display
--    name, JS's plain-object name index keeps whichever was iterated last
--    (undefined which, given no ORDER BY in the client fetch); this SQL
--    picks the lowest client id for that name deterministically -- a
--    different tie-break for an already-arbitrary edge case, not a change
--    to any case with unique names.

CREATE OR REPLACE FUNCTION public.get_customer_ledger_inputs(p_org_id uuid, p_apply_adjustments boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('trip_inputs', '[]'::jsonb, 'unlinked_payments', '[]'::jsonb, 'ledger_only_parties', '[]'::jsonb);
  END IF;

  WITH client_name_index AS (
    SELECT DISTINCT ON (lower(trim(coalesce(name, ''))))
      lower(trim(coalesce(name, ''))) AS name_key, id AS client_id
    FROM public.clients
    WHERE organization_id = p_org_id AND trim(coalesce(name, '')) <> ''
    ORDER BY lower(trim(coalesce(name, ''))), id ASC
  ),
  client_linked_org_index AS (
    SELECT DISTINCT ON (linked_organization_id)
      linked_organization_id, id AS client_id
    FROM public.clients
    WHERE organization_id = p_org_id AND linked_organization_id IS NOT NULL
    ORDER BY linked_organization_id, id ASC
  ),
  trip_attribution AS (
    -- Priority 1: load-based (indent_id set) trip whose owning org maps to a
    -- local client via linked_organization_id -> use that client, bill at
    -- supplier_rate. Priority 2: trip's own client_id, else name match on
    -- client_name -> bill at client_price.
    SELECT
      t.id AS trip_id,
      coalesce(
        CASE WHEN t.indent_id IS NOT NULL THEN cloi.client_id ELSE NULL END,
        t.client_id,
        cni.client_id
      ) AS client_id,
      CASE WHEN t.indent_id IS NOT NULL AND cloi.client_id IS NOT NULL
        THEN coalesce(t.supplier_rate, 0)
        ELSE coalesce(t.client_price, 0)
      END AS base_amount,
      t.amount_paid
    FROM public.trips t
    LEFT JOIN client_linked_org_index cloi ON cloi.linked_organization_id = t.organization_id
    LEFT JOIN client_name_index cni ON cni.name_key = lower(trim(coalesce(t.client_name, '')))
    WHERE t.organization_id = p_org_id
  ),
  trip_with_client AS (
    SELECT * FROM trip_attribution WHERE client_id IS NOT NULL
  ),
  trip_adjustment_totals AS (
    SELECT
      tfa.trip_id,
      sum(CASE WHEN tfa.impact = 'plus' THEN tfa.amount ELSE -tfa.amount END) AS delta
    FROM public.trip_finance_adjustments tfa
    WHERE tfa.type = 'revenue' AND tfa.voided_at IS NULL
      AND tfa.trip_id IN (SELECT trip_id FROM trip_with_client)
    GROUP BY tfa.trip_id
  ),
  trip_sales AS (
    SELECT
      twc.trip_id,
      twc.client_id,
      CASE WHEN p_apply_adjustments
        THEN greatest(0, twc.base_amount + coalesce(tat.delta, 0))
        ELSE twc.base_amount
      END AS sales,
      twc.amount_paid
    FROM trip_with_client twc
    LEFT JOIN trip_adjustment_totals tat ON tat.trip_id = twc.trip_id
  ),
  client_tx_resolved AS (
    -- Every client-type transaction in the org, resolved to a client_id via
    -- contact_id, else the trip's own resolved client, else name match --
    -- same three-step fallback aggregateCustomers.ts uses.
    SELECT
      tx.id AS tx_id,
      tx.trip_id,
      tx.amount_in,
      tx.transaction_date,
      tx.created_at,
      coalesce(
        tx.contact_id,
        (SELECT tw.client_id FROM trip_with_client tw WHERE tw.trip_id = tx.trip_id),
        cni.client_id
      ) AS client_id
    FROM public.transactions tx
    LEFT JOIN client_name_index cni ON cni.name_key = lower(trim(coalesce(tx.party_name, '')))
    WHERE tx.organization_id = p_org_id AND tx.contact_type = 'client'
  ),
  linked_tx AS (
    -- A resolved client transaction counts as "linked" only when its trip_id
    -- belongs to THAT SAME client's own trip set (trip_sales).
    SELECT ctr.*
    FROM client_tx_resolved ctr
    JOIN trip_sales ts ON ts.trip_id = ctr.trip_id AND ts.client_id = ctr.client_id
    WHERE ctr.trip_id IS NOT NULL AND ctr.client_id IS NOT NULL
  ),
  linked_tx_per_trip AS (
    SELECT trip_id, sum(amount_in) AS linked_amount_in
    FROM linked_tx
    GROUP BY trip_id
  ),
  trip_initial_paid AS (
    -- computeLedgerDerivedPaidSeed: amount_paid seeds the trip's paid total
    -- ONLY when no linked client transaction exists for it (amount_paid is
    -- itself ledger-synced by a DB trigger and would double-count
    -- otherwise); linked transaction amounts are always added.
    SELECT
      ts.trip_id,
      ts.client_id,
      ts.sales,
      (CASE WHEN ltp.trip_id IS NULL THEN coalesce(ts.amount_paid, 0) ELSE 0 END
        + coalesce(ltp.linked_amount_in, 0)) AS initial_paid
    FROM trip_sales ts
    LEFT JOIN linked_tx_per_trip ltp ON ltp.trip_id = ts.trip_id
  ),
  unlinked_tx AS (
    SELECT ctr.*
    FROM client_tx_resolved ctr
    WHERE ctr.client_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM linked_tx lt WHERE lt.tx_id = ctr.tx_id
      )
  ),
  ledger_only_tx AS (
    SELECT tx.party_name, tx.amount_in, tx.amount_out
    FROM public.transactions tx
    WHERE tx.organization_id = p_org_id
      AND tx.contact_type = 'client'
      AND tx.contact_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM client_name_index cni WHERE cni.name_key = lower(trim(coalesce(tx.party_name, '')))
      )
      AND trim(coalesce(tx.party_name, '')) <> ''
  )
  SELECT jsonb_build_object(
    'trip_inputs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'client_id', trip_id_wrap.client_id,
        'trip_id', trip_id_wrap.trip_id,
        'sales', trip_id_wrap.sales,
        'initial_paid', trip_id_wrap.initial_paid
      ))
      FROM trip_initial_paid trip_id_wrap
    ), '[]'::jsonb),
    'unlinked_payments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'client_id', u.client_id,
        'transaction_id', u.tx_id,
        'amount_in', u.amount_in
      ) ORDER BY u.transaction_date DESC, u.created_at DESC, u.tx_id DESC)
      FROM unlinked_tx u
    ), '[]'::jsonb),
    'ledger_only_parties', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'party_name', p.party_name,
        'received', p.received,
        'pending', p.pending
      ))
      FROM (
        SELECT party_name, sum(amount_in) AS received, sum(amount_out) AS pending
        FROM ledger_only_tx
        GROUP BY party_name
      ) p
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_ledger_inputs(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_ledger_inputs(uuid, boolean) TO authenticated;
