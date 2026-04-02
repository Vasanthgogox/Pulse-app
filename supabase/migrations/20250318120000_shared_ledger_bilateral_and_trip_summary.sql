-- Shared ledger: bilateral-only entries + trip summary so client view does not show supplier expenses.
-- 1) get_shared_ledger_entries: only return partner org transactions where contact_id = counterparty
--    (excludes trip-linked expense/driver/vehicle entries).
-- 2) get_shared_ledger_trip_summary: return per-trip partner_sales (from partner's trip row) and
--    partner_paid (sum of bilateral amount_in) for correct reconciliation without expenses.

-- 1) Replace get_shared_ledger_entries to filter by counterparty (bilateral only)
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

  -- Resolve counterparty in partner org: the contact that represents the caller in the partner's book.
  -- Caller's client -> partner is supplier org -> counterparty = supplier's client where linked_organization_id = org_id.
  -- Caller's supplier -> partner is client org -> counterparty = client's supplier where linked_organization_id = org_id.
  IF EXISTS (SELECT 1 FROM public.clients c WHERE c.id = partner_key AND c.organization_id = org_id LIMIT 1) THEN
    SELECT s.id INTO counterparty_contact_id
    FROM public.suppliers s
    WHERE s.organization_id = partner_org_id_val AND s.linked_organization_id = org_id
    LIMIT 1;
  ELSE
    SELECT c.id INTO counterparty_contact_id
    FROM public.clients c
    WHERE c.organization_id = partner_org_id_val AND c.linked_organization_id = org_id
    LIMIT 1;
  END IF;

  -- Only return bilateral transactions (excludes expense/driver/vehicle entries with no or wrong contact).
  RETURN QUERY
  SELECT
    t.id,
    (t.amount_in - t.amount_out)::numeric AS amount,
    t.transaction_date,
    t.trip_id AS reference_id
  FROM public.transactions t
  WHERE t.organization_id = partner_org_id_val
    AND t.trip_id IS NOT NULL
    AND (counterparty_contact_id IS NOT NULL AND t.contact_id = counterparty_contact_id)
    AND t.trip_id IN (
      SELECT DISTINCT tr.trip_id
      FROM public.transactions tr
      WHERE tr.organization_id = org_id
        AND tr.contact_id = partner_key
        AND tr.trip_id IS NOT NULL
    )
  ORDER BY t.transaction_date, t.created_at;
END;
$$;

COMMENT ON FUNCTION public.get_shared_ledger_entries(uuid, uuid) IS
  'Returns partner org ledger entries for shared trips (bilateral only: contact_id = counterparty). Excludes expense/driver/vehicle entries so client view does not show supplier internal costs.';

-- 2) New RPC: per-trip partner_sales (from partner trip row) and partner_paid (bilateral amount_in only)
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

  -- is_partner_client = true when the partner is our CLIENT (so in their book we are recorded as a SUPPLIER contact).
  is_partner_client := EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = partner_key AND c.organization_id = org_id
    LIMIT 1
  );

  IF is_partner_client THEN
    SELECT s.id INTO counterparty_contact_id
    FROM public.suppliers s
    WHERE s.organization_id = partner_org_id_val AND s.linked_organization_id = org_id
    LIMIT 1;
  ELSE
    SELECT c.id INTO counterparty_contact_id
    FROM public.clients c
    WHERE c.organization_id = partner_org_id_val AND c.linked_organization_id = org_id
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    shared.trip_id,
    COALESCE(ptr.client_price, 0)::numeric AS partner_sales,
    COALESCE(paid.amount_sum, 0)::numeric AS partner_paid
  FROM (
    SELECT DISTINCT tr.trip_id
    FROM public.transactions tr
    WHERE tr.organization_id = org_id
      AND tr.contact_id = partner_key
      AND tr.trip_id IS NOT NULL
  ) shared
  LEFT JOIN public.trips ptr ON ptr.id = shared.trip_id AND ptr.organization_id = partner_org_id_val
  LEFT JOIN (
    SELECT t.trip_id,
           -- When partner is our CLIENT: they pay us as Cash OUT (amount_out) in their book.
           -- When partner is our SUPPLIER: we pay them; in their book this is Cash IN (amount_in).
           SUM(
             CASE
               WHEN is_partner_client THEN t.amount_out
               ELSE t.amount_in
             END
           ) AS amount_sum
    FROM public.transactions t
    WHERE t.organization_id = partner_org_id_val
      AND t.trip_id IS NOT NULL
      AND (counterparty_contact_id IS NOT NULL AND t.contact_id = counterparty_contact_id)
    GROUP BY t.trip_id
  ) paid ON paid.trip_id = shared.trip_id;
END;
$$;

COMMENT ON FUNCTION public.get_shared_ledger_trip_summary(uuid, uuid) IS
  'Per-trip partner sales (from partner trips.client_price) and partner paid (bilateral amount_in only). Use for Compare & Verify so client view does not include supplier expenses.';

REVOKE ALL ON FUNCTION public.get_shared_ledger_trip_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_ledger_trip_summary(uuid, uuid) TO authenticated;
