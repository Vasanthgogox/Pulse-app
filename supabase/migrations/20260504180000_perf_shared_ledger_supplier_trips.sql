-- Performance: reduce planner-hostile OR joins in shared ledger RPCs, remove unnecessary DISTINCT ON
-- in supplier-trip discovery, and add targeted btree indexes for hot predicates.
--
-- Safe to re-run: CREATE INDEX IF NOT EXISTS + CREATE OR REPLACE FUNCTION.

-- ---------------------------------------------------------------------------
-- Indexes (btree; no CONCURRENTLY — migrations run in a transaction on hosted Supabase)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_trips_org_indent_supplier_created
  ON public.trips (organization_id, indent_id, supplier_id, created_at DESC)
  WHERE indent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dq_accepted_bidder_indent
  ON public.direct_quotes (bidder_organization_id, indent_id)
  WHERE lower(trim(coalesce(status, ''))) = 'accepted';

CREATE INDEX IF NOT EXISTS idx_txn_org_contact_trip
  ON public.transactions (organization_id, contact_id, trip_id)
  WHERE trip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_org_linked
  ON public.clients (organization_id, linked_organization_id)
  WHERE linked_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_org_linked
  ON public.suppliers (organization_id, linked_organization_id)
  WHERE linked_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trips_org_client_indent
  ON public.trips (organization_id, client_id, indent_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trips_org_supplier_indent
  ON public.trips (organization_id, supplier_id, indent_id)
  WHERE supplier_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RPC: supplier org indent trips (linked supplier OR accepted direct_quote bidder)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_trips_where_org_is_supplier(p_org_id uuid)
RETURNS SETOF public.trips
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.*
  FROM public.trips t
  WHERE t.indent_id IS NOT NULL
    AND public.is_org_member(p_org_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.suppliers s
        WHERE s.id = t.supplier_id
          AND s.linked_organization_id = p_org_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.direct_quotes dq
        WHERE dq.indent_id = t.indent_id
          AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
          AND dq.bidder_organization_id = p_org_id
      )
    )
  ORDER BY t.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_trips_where_org_is_supplier(uuid) IS
  'Indent/load trips for supplier org: linked suppliers row OR accepted direct_quote bidder = p_org_id.';

-- ---------------------------------------------------------------------------
-- RPC: shared ledger entries (bilateral mapping)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_shared_ledger_entries(
  org_id uuid,
  partner_key uuid
)
RETURNS TABLE (
  id uuid,
  amount numeric,
  transaction_date date,
  reference_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_org_id_val uuid;
  counterparty_contact_id uuid;
  is_partner_client boolean := false;
BEGIN
  IF NOT public.is_org_member(org_id) THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    (SELECT c.linked_organization_id FROM public.clients c WHERE c.id = partner_key AND c.organization_id = org_id AND c.linked_organization_id IS NOT NULL LIMIT 1),
    (SELECT s.linked_organization_id FROM public.suppliers s WHERE s.id = partner_key AND s.organization_id = org_id AND s.linked_organization_id IS NOT NULL LIMIT 1)
  ) INTO partner_org_id_val;

  IF partner_org_id_val IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = partner_key
      AND c.organization_id = org_id
    LIMIT 1
  ) THEN
    is_partner_client := true;
    SELECT s.id INTO counterparty_contact_id
    FROM public.suppliers s
    WHERE s.organization_id = partner_org_id_val
      AND s.linked_organization_id = org_id
    LIMIT 1;
  ELSE
    SELECT c.id INTO counterparty_contact_id
    FROM public.clients c
    WHERE c.organization_id = partner_org_id_val
      AND c.linked_organization_id = org_id
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH shared_viewer_trips AS (
    SELECT DISTINCT tr.trip_id AS trip_id
    FROM public.transactions tr
    WHERE tr.organization_id = org_id
      AND tr.contact_id = partner_key
      AND tr.trip_id IS NOT NULL

    UNION

    SELECT t.id AS trip_id
    FROM public.trips t
    WHERE t.organization_id = org_id
      AND (
        (is_partner_client AND t.client_id = partner_key)
        OR (NOT is_partner_client AND t.supplier_id = partner_key)
      )
  ),
  shared_with_indent AS (
    SELECT svt.trip_id, vt.indent_id
    FROM shared_viewer_trips svt
    LEFT JOIN public.trips vt ON vt.id = svt.trip_id
  ),
  partner_bilateral_rows AS (
    SELECT
      t.id,
      t.amount_in,
      t.amount_out,
      t.transaction_date,
      t.trip_id AS partner_trip_id,
      pt.indent_id AS partner_indent_id
    FROM public.transactions t
    LEFT JOIN public.trips pt ON pt.id = t.trip_id
    WHERE t.organization_id = partner_org_id_val
      AND t.trip_id IS NOT NULL
      AND counterparty_contact_id IS NOT NULL
      AND t.contact_id = counterparty_contact_id
  ),
  mapped_partner_rows_by_trip AS (
    SELECT
      pbr.id,
      pbr.amount_in,
      pbr.amount_out,
      pbr.transaction_date,
      swi.trip_id AS viewer_trip_id
    FROM partner_bilateral_rows pbr
    JOIN shared_with_indent swi
      ON pbr.partner_trip_id = swi.trip_id
  ),
  mapped_partner_rows_by_indent AS (
    SELECT
      pbr.id,
      pbr.amount_in,
      pbr.amount_out,
      pbr.transaction_date,
      swi.trip_id AS viewer_trip_id
    FROM partner_bilateral_rows pbr
    JOIN shared_with_indent swi
      ON pbr.partner_indent_id IS NOT NULL
     AND swi.indent_id IS NOT NULL
     AND pbr.partner_indent_id = swi.indent_id
  ),
  mapped_partner_rows AS (
    SELECT DISTINCT ON (u.id)
      u.id,
      u.amount_in,
      u.amount_out,
      u.transaction_date,
      u.viewer_trip_id
    FROM (
      SELECT * FROM mapped_partner_rows_by_trip
      UNION ALL
      SELECT * FROM mapped_partner_rows_by_indent
    ) u
    ORDER BY u.id, u.viewer_trip_id NULLS LAST
  )
  SELECT
    mpr.id,
    (mpr.amount_in - mpr.amount_out)::numeric AS amount,
    mpr.transaction_date,
    mpr.viewer_trip_id AS reference_id
  FROM mapped_partner_rows mpr
  ORDER BY mpr.transaction_date, mpr.id;
END;
$$;

COMMENT ON FUNCTION public.get_shared_ledger_entries(uuid, uuid) IS
  'Returns partner org ledger entries for shared trips (bilateral only), including linked trips before viewer posts local tx. Maps by trip_id or shared indent_id.';

-- ---------------------------------------------------------------------------
-- RPC: shared ledger trip summary (same join semantics; avoids double-count)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_shared_ledger_trip_summary(
  org_id uuid,
  partner_key uuid
)
RETURNS TABLE (
  trip_id uuid,
  partner_sales numeric,
  partner_paid numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_org_id_val uuid;
  counterparty_contact_id uuid;
  is_partner_client boolean := false;
BEGIN
  IF NOT public.is_org_member(org_id) THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    (SELECT c.linked_organization_id FROM public.clients c WHERE c.id = partner_key AND c.organization_id = org_id AND c.linked_organization_id IS NOT NULL LIMIT 1),
    (SELECT s.linked_organization_id FROM public.suppliers s WHERE s.id = partner_key AND s.organization_id = org_id AND s.linked_organization_id IS NOT NULL LIMIT 1)
  ) INTO partner_org_id_val;

  IF partner_org_id_val IS NULL THEN
    RETURN;
  END IF;

  is_partner_client := EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = partner_key
      AND c.organization_id = org_id
    LIMIT 1
  );

  IF is_partner_client THEN
    SELECT s.id INTO counterparty_contact_id
    FROM public.suppliers s
    WHERE s.organization_id = partner_org_id_val
      AND s.linked_organization_id = org_id
    LIMIT 1;
  ELSE
    SELECT c.id INTO counterparty_contact_id
    FROM public.clients c
    WHERE c.organization_id = partner_org_id_val
      AND c.linked_organization_id = org_id
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH shared_viewer_trips AS (
    SELECT DISTINCT tr.trip_id AS trip_id
    FROM public.transactions tr
    WHERE tr.organization_id = org_id
      AND tr.contact_id = partner_key
      AND tr.trip_id IS NOT NULL

    UNION

    SELECT t.id AS trip_id
    FROM public.trips t
    WHERE t.organization_id = org_id
      AND (
        (is_partner_client AND t.client_id = partner_key)
        OR (NOT is_partner_client AND t.supplier_id = partner_key)
      )
  ),
  shared_with_indent AS (
    SELECT svt.trip_id, vt.indent_id
    FROM shared_viewer_trips svt
    LEFT JOIN public.trips vt ON vt.id = svt.trip_id
  ),
  partner_txn_by_trip AS (
    SELECT
      swi.trip_id,
      t.id AS txn_id,
      CASE
        WHEN is_partner_client THEN COALESCE(t.amount_out, 0)
        ELSE COALESCE(t.amount_in, 0)
      END AS paid_amount
    FROM public.transactions t
    LEFT JOIN public.trips pt ON pt.id = t.trip_id
    JOIN shared_with_indent swi
      ON t.trip_id = swi.trip_id
    WHERE t.organization_id = partner_org_id_val
      AND t.trip_id IS NOT NULL
      AND counterparty_contact_id IS NOT NULL
      AND t.contact_id = counterparty_contact_id
  ),
  partner_txn_by_indent AS (
    SELECT
      swi.trip_id,
      t.id AS txn_id,
      CASE
        WHEN is_partner_client THEN COALESCE(t.amount_out, 0)
        ELSE COALESCE(t.amount_in, 0)
      END AS paid_amount
    FROM public.transactions t
    LEFT JOIN public.trips pt ON pt.id = t.trip_id
    JOIN shared_with_indent swi
      ON pt.indent_id IS NOT NULL
     AND swi.indent_id IS NOT NULL
     AND pt.indent_id = swi.indent_id
    WHERE t.organization_id = partner_org_id_val
      AND t.trip_id IS NOT NULL
      AND counterparty_contact_id IS NOT NULL
      AND t.contact_id = counterparty_contact_id
  ),
  partner_txn AS (
    SELECT DISTINCT ON (u.txn_id)
      u.trip_id,
      u.txn_id,
      u.paid_amount
    FROM (
      SELECT * FROM partner_txn_by_trip
      UNION ALL
      SELECT * FROM partner_txn_by_indent
    ) u
    ORDER BY u.txn_id, u.trip_id NULLS LAST
  ),
  partner_paid_map AS (
    SELECT
      p.trip_id,
      SUM(p.paid_amount) AS amount_sum
    FROM partner_txn p
    GROUP BY p.trip_id
  )
  SELECT
    swi.trip_id,
    COALESCE(vt.supplier_rate, 0)::numeric AS partner_sales,
    COALESCE(ppm.amount_sum, 0)::numeric AS partner_paid
  FROM shared_with_indent swi
  LEFT JOIN public.trips vt
    ON vt.id = swi.trip_id
   AND vt.organization_id = org_id
  LEFT JOIN partner_paid_map ppm
    ON ppm.trip_id = swi.trip_id;
END;
$$;

COMMENT ON FUNCTION public.get_shared_ledger_trip_summary(uuid, uuid) IS
  'Per-trip partner sales/paid for shared ledger. Includes linked trips before viewer local tx exists; maps partner paid by bilateral rows via trip_id or shared indent_id. sales remains supplier_rate.';
