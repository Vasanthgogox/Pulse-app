-- Phase 6c.3 correction, caught by C3 fixture-building before any TS cutover:
-- 20270310150000 covers trip_inputs (clients with trips, feeding the allocator)
-- and ledger_only_parties (party_name with NO match to any real client), but
-- has no equivalent of aggregateCustomers.ts's "legacy formula" branch --
-- a REAL client (matched by contact_id, or by name to a real client) with
-- ZERO trips still has ledger activity in production:
--   pending = billed > 0 ? max(0, billed - ledgerReceived) : pendingLedger
--   received = clientTrips.length > 0 ? max(0, billed - pending) : ledgerReceived
-- For a tripless client, billed is always 0, so this reduces to
-- pending = pendingLedger, received = ledgerReceived -- neither of which
-- 150000 exposed anywhere in its jsonb output.
--
-- Confirmed live and non-hypothetical: 3 real clients across 3 different
-- orgs on the linked project have contact_id-matched transactions but zero
-- trips (e.g. an advance payment recorded before any trip exists). A
-- TS cutover built only on 150000's current output would have silently
-- dropped these clients' balances.
--
-- Fix: client_ledger_totals sums amount_in/amount_out per resolved client_id
-- from client_tx_resolved (already the same three-step contact_id / trip's
-- own client / name-match resolution aggregateCustomers.ts uses for both
-- ledgerByClientId and the real-client-name subset of ledgerByPartyName) --
-- this covers every resolved client, trip-having or not; the caller uses it
-- only for the tripless branch (a client with trip_inputs rows continues to
-- derive received from billed - pending, exactly as today).

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
    RETURN jsonb_build_object('trip_inputs', '[]'::jsonb, 'unlinked_payments', '[]'::jsonb, 'ledger_only_parties', '[]'::jsonb, 'client_ledger_totals', '[]'::jsonb);
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
      tx.amount_out,
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
  client_ledger_totals AS (
    -- Covers aggregateCustomers.ts's tripless "legacy formula" branch
    -- (pending = pendingLedger, received = ledgerReceived when a resolved
    -- client has no trips at all) -- every resolved client_id, not just
    -- ones with trip_inputs rows.
    SELECT client_id, sum(amount_in) AS received, sum(amount_out) AS pending
    FROM client_tx_resolved
    WHERE client_id IS NOT NULL
    GROUP BY client_id
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
    ), '[]'::jsonb),
    'client_ledger_totals', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'client_id', clt.client_id,
        'received', clt.received,
        'pending', clt.pending
      ))
      FROM client_ledger_totals clt
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_ledger_inputs(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_ledger_inputs(uuid, boolean) TO authenticated;
