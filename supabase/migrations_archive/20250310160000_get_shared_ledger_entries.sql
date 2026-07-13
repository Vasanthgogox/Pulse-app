-- RPC: get_shared_ledger_entries(org_id, partner_key)
-- Returns the partner org's ledger entries for trips shared with the caller, so the app can
-- build sharedTrips (sales/paid per trip) and show variance / Raise Dispute / Update My Book.
-- partner_key = contact_id (client.id or supplier.id from caller's perspective).
-- Return: id, amount (positive = cash-in, negative = cash-out), transaction_date, reference_id = trip_id.

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
BEGIN
  -- Caller must be an active member of org_id
  IF NOT public.is_org_member(org_id) THEN
    RETURN;
  END IF;

  -- Resolve partner org: contact (client or supplier) belongs to caller; linked_organization_id is the partner org
  SELECT COALESCE(
    (SELECT c.linked_organization_id FROM public.clients c WHERE c.id = partner_key AND c.organization_id = org_id AND c.linked_organization_id IS NOT NULL LIMIT 1),
    (SELECT s.linked_organization_id FROM public.suppliers s WHERE s.id = partner_key AND s.organization_id = org_id AND s.linked_organization_id IS NOT NULL LIMIT 1)
  ) INTO partner_org_id_val;

  IF partner_org_id_val IS NULL THEN
    RETURN;
  END IF;

  -- Return partner org's transactions for trips that the caller has with this contact
  RETURN QUERY
  SELECT
    t.id,
    (t.amount_in - t.amount_out)::numeric AS amount,
    t.transaction_date,
    t.trip_id AS reference_id
  FROM public.transactions t
  WHERE t.organization_id = partner_org_id_val
    AND t.trip_id IS NOT NULL
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
  'Returns partner org ledger entries for shared trips; used by Compare & Verify to show variance and Raise Dispute. reference_id = trip_id.';

REVOKE ALL ON FUNCTION public.get_shared_ledger_entries(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_ledger_entries(uuid, uuid) TO authenticated;
