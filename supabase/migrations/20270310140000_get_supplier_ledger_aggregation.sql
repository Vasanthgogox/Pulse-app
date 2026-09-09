-- Phase 6c.2: server-side, unbounded equivalent of aggregateSuppliers.ts.
-- Confirmed by trace: suppliers do NOT share customers' allocator -- this is
-- a flat additive aggregation, structurally identical to drivers' shape
-- (due = sum from trips, paid = sum from ledger, unsettled = max(0, due-paid)).
-- The "mirrors customers" comment in the source file refers only to the
-- revenue-recognition-timing rule (trips only, never pre-conversion
-- indents), not to any per-trip allocation mechanism.
--
-- Anti-fan-out: trip_supplier_resolution collapses every trip to AT MOST ONE
-- resolved supplier_id before either due-total CTE or the payment-fallback
-- CTE ever groups by it.
--
-- Supplier name fallback intentionally omitted: aggregateSuppliers.ts has a
-- "match trip to supplier by name when supplier_id is absent" branch
-- (its own test at aggregateSuppliers.test.ts:18), but tracing both real
-- callers (SuppliersTab.tsx and FinanceScreen.tsx) shows they both source
-- trips via useTripsQuery -> get_trips_for_org, whose result never contains
-- supplier_name -- confirmed both statically (that RPC's body never
-- references supplier_name or joins suppliers) and empirically (this
-- migration's first draft referenced trips.supplier_name directly and
-- failed to apply with `column t.supplier_name does not exist` -- the
-- underlying table has no such column at all; the only place a real
-- supplier_name value exists is view v_active_trips, computed as
-- suppliers.company_name, which neither caller queries). The JS branch is
-- therefore not reachable through either production caller today. Do NOT
-- reintroduce a join here to "restore" it -- if the trips query these
-- callers use ever changes to expose supplier_name, this SQL needs a
-- matching update then, not preemptively. The JS branch and its test are
-- deliberately left untouched in aggregateSuppliers.ts; this is a SQL-
-- equivalence decision, not a source-code cleanup.
--
-- The "as-client" branch replicates get_trips_where_org_is_client's exact
-- filter (traced from the live function: clients.linked_organization_id =
-- p_org_id AND trips.indent_id IS NOT NULL) rather than approximating it,
-- since that RPC is the actual source of the tripsWhereOrgIsClient array the
-- JS function receives today.
--
-- CORRECTION (superseding an earlier draft's claim): transactions has no
-- trip_number COLUMN, but getTransactionsByOrganization's select embeds the
-- joined trip's trip_number, AND buildUnanchoredLedgerRetryDescription
-- (finance.service.ts:687+) writes a recoverable trip_number into the
-- description's [[QMETA:...]] block specifically when a trip_id anchor was
-- rejected -- a real recovery mechanism for cross-org integrated supplier
-- transactions, not dead code. supplier_paid therefore adds a third
-- fallback (extract_ledger_meta_trip_number) matching tripPartyByRef's
-- trip-number-keyed lookup, ordered so at most ONE attribution mechanism
-- ever resolves a given transaction: contact_id, else trip_id, else QMETA
-- trip_number. trips.(organization_id, trip_number) is a real unique
-- constraint (confirmed live), so the QMETA-keyed lookup can match at most
-- one supplier per transaction, same as the other two paths.

CREATE OR REPLACE FUNCTION public.get_supplier_ledger_aggregation(p_org_id uuid)
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
    -- "Supplier name fallback intentionally omitted" note above.
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
  own_trip_cost AS (
    SELECT
      supplier_id,
      count(*)::int AS trips_count,
      sum(coalesce(supplier_rate, 0)) AS due
    FROM trip_supplier_resolution
    WHERE supplier_id IS NOT NULL
    GROUP BY supplier_id
  ),
  as_client_cost AS (
    SELECT
      sloi.supplier_id,
      count(*)::int AS trips_count,
      sum(coalesce(t.client_price, t.supplier_rate, 0)) AS due
    FROM public.trips t
    JOIN public.clients c ON c.id = t.client_id
    JOIN supplier_linked_org_index sloi ON sloi.linked_organization_id = t.organization_id
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

REVOKE ALL ON FUNCTION public.get_supplier_ledger_aggregation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supplier_ledger_aggregation(uuid) TO authenticated;
