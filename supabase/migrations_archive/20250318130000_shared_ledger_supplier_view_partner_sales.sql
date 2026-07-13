-- Fix get_shared_ledger_trip_summary: for BOTH client and supplier views, partner_sales must be
-- supplier_rate (payables/receivables between client and supplier). Never use client_price (client's
-- internal billing to end customer — not relevant to shared ledger reconciliation).

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
  -- When supplier views client: partner's trip.client_price = what client charges end customer; supplier_rate = what client pays us.
  -- For reconciliation, supplier needs partner_sales = supplier_rate (agreed amount client pays supplier).
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
    -- Use ONLY supplier_rate (payables/receivables). Never client_price (client's internal billing).
    COALESCE(ptr.supplier_rate, 0)::numeric AS partner_sales,
    COALESCE(paid.amount_sum, 0)::numeric AS partner_paid
  FROM (
    SELECT DISTINCT tr.trip_id
    FROM public.transactions tr
    WHERE tr.organization_id = org_id
      AND tr.contact_id = partner_key
      AND tr.trip_id IS NOT NULL
  ) shared
  LEFT JOIN public.trips ptr ON ptr.id = shared.trip_id
    AND (ptr.organization_id = partner_org_id_val OR ptr.organization_id = org_id)
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
  'Per-trip partner sales and partner paid. partner_sales = supplier_rate only (payables/receivables). Never client_price. partner_paid = bilateral payments only.';

REVOKE ALL ON FUNCTION public.get_shared_ledger_trip_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_ledger_trip_summary(uuid, uuid) TO authenticated;
