-- RPC: accept_partner_view(org_id, trip_id, partner_sales, partner_paid, contact_id)
-- Updates the caller org's ledger for that trip (and optional contact) to match partner's sales/paid.
-- Used by "Update my book" in Shared Ledger Compare & Verify. No dispute is created.
-- contact_id optional: when provided, only transactions for that contact are updated; when NULL, all for trip.

CREATE OR REPLACE FUNCTION public.accept_partner_view(
  org_id uuid,
  trip_id uuid,
  partner_sales numeric,
  partner_paid numeric,
  contact_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trip_org_id uuid;
  first_contact_id uuid;
  first_contact_type text;
  first_party_name text;
BEGIN
  -- Caller must be an active member of org_id
  IF NOT public.is_org_member(accept_partner_view.org_id) THEN
    RETURN;
  END IF;

  -- Resolve trip owner (may be caller or partner, e.g. client updating for supplier-owned trip)
  SELECT t.organization_id INTO trip_org_id
  FROM public.trips t
  WHERE t.id = accept_partner_view.trip_id;

  -- Preserve first matching transaction's contact/party for the new row (caller's own rows)
  SELECT tr.contact_id, tr.contact_type, tr.party_name
  INTO first_contact_id, first_contact_type, first_party_name
  FROM public.transactions tr
  WHERE tr.organization_id = accept_partner_view.org_id
    AND tr.trip_id = accept_partner_view.trip_id
    AND (accept_partner_view.contact_id IS NULL OR tr.contact_id = accept_partner_view.contact_id)
  ORDER BY tr.created_at
  LIMIT 1;

  -- Delete caller's matching transactions for this trip (and contact if specified)
  -- Qualify table columns to avoid ambiguous reference with function parameters (trip_id, contact_id)
  DELETE FROM public.transactions
  WHERE public.transactions.organization_id = accept_partner_view.org_id
    AND public.transactions.trip_id = accept_partner_view.trip_id
    AND (accept_partner_view.contact_id IS NULL OR public.transactions.contact_id = accept_partner_view.contact_id);

  -- Update trip so sales match partner only when caller owns the trip
  IF trip_org_id IS NOT NULL AND trip_org_id = accept_partner_view.org_id THEN
    UPDATE public.trips t
    SET
      client_price = COALESCE(accept_partner_view.partner_sales, 0),
      supplier_rate = COALESCE(accept_partner_view.partner_sales, 0),
      updated_at = now()
    WHERE t.id = accept_partner_view.trip_id
      AND t.organization_id = accept_partner_view.org_id;
  END IF;

  -- Insert one ledger row so "paid" = partner_paid (unless zero; CHECK requires one of in/out non-zero)
  IF accept_partner_view.partner_paid IS NOT NULL AND accept_partner_view.partner_paid <> 0 THEN
    INSERT INTO public.transactions (
      organization_id,
      trip_id,
      party_name,
      description,
      amount_in,
      amount_out,
      transaction_date,
      contact_id,
      contact_type
    ) VALUES (
      accept_partner_view.org_id,
      accept_partner_view.trip_id,
      COALESCE(first_party_name, 'Ledger update'),
      'Shared ledger sync',
      CASE WHEN accept_partner_view.partner_paid > 0 THEN accept_partner_view.partner_paid ELSE 0 END,
      CASE WHEN accept_partner_view.partner_paid < 0 THEN (-accept_partner_view.partner_paid) ELSE 0 END,
      current_date,
      COALESCE(accept_partner_view.contact_id, first_contact_id),
      first_contact_type
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.accept_partner_view(uuid, uuid, numeric, numeric, uuid) IS
  'Self-correct: update caller org ledger for trip to match partner_sales/partner_paid. Used by Update my book.';

REVOKE ALL ON FUNCTION public.accept_partner_view(uuid, uuid, numeric, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_partner_view(uuid, uuid, numeric, numeric, uuid) TO authenticated;
