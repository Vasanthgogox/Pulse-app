-- Fix supplier-side "They record" gaps in Shared Ledger:
-- When the supplier has not yet posted a local transaction for a trip, partner entries/summary
-- were filtered out because both RPCs scoped shared trips only from local transactions.
--
-- This patch keeps bilateral accounting logic intact, but expands shared-trip discovery to include
-- caller-owned trips already linked to the partner contact (client_id / supplier_id), then maps
-- partner entries by trip_id OR shared indent_id.

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
    -- Existing behavior: trips already present in viewer ledger for this partner.
    SELECT DISTINCT tr.trip_id AS trip_id
    FROM public.transactions tr
    WHERE tr.organization_id = org_id
      AND tr.contact_id = partner_key
      AND tr.trip_id IS NOT NULL

    UNION

    -- New: include viewer-owned trips linked to this partner even before local payment rows exist.
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
  mapped_partner_rows AS (
    SELECT
      pbr.id,
      pbr.amount_in,
      pbr.amount_out,
      pbr.transaction_date,
      swi.trip_id AS viewer_trip_id
    FROM partner_bilateral_rows pbr
    JOIN shared_with_indent swi
      ON (
        pbr.partner_trip_id = swi.trip_id
        OR (
          pbr.partner_indent_id IS NOT NULL
          AND swi.indent_id IS NOT NULL
          AND pbr.partner_indent_id = swi.indent_id
        )
      )
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
    -- Existing behavior: viewer transaction-linked trips.
    SELECT DISTINCT tr.trip_id AS trip_id
    FROM public.transactions tr
    WHERE tr.organization_id = org_id
      AND tr.contact_id = partner_key
      AND tr.trip_id IS NOT NULL

    UNION

    -- New: include viewer-owned trips linked to partner contact.
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
  partner_paid_map AS (
    SELECT
      swi.trip_id,
      SUM(
        CASE
          WHEN is_partner_client THEN COALESCE(t.amount_out, 0)
          ELSE COALESCE(t.amount_in, 0)
        END
      ) AS amount_sum
    FROM public.transactions t
    LEFT JOIN public.trips pt ON pt.id = t.trip_id
    JOIN shared_with_indent swi
      ON (
        t.trip_id = swi.trip_id
        OR (
          pt.indent_id IS NOT NULL
          AND swi.indent_id IS NOT NULL
          AND pt.indent_id = swi.indent_id
        )
      )
    WHERE t.organization_id = partner_org_id_val
      AND t.trip_id IS NOT NULL
      AND counterparty_contact_id IS NOT NULL
      AND t.contact_id = counterparty_contact_id
    GROUP BY swi.trip_id
  )
  SELECT
    swi.trip_id,
    -- Shared-ledger sales is bilateral payable/receivable value.
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
