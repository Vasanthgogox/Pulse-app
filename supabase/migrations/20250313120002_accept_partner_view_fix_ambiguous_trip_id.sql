-- Fix: "column reference trip_id is ambiguous" in accept_partner_view.
-- Use local variables for all parameters so no parameter name can be confused with table columns.

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
  v_org_id uuid := accept_partner_view.org_id;
  v_trip_id uuid := accept_partner_view.trip_id;
  v_partner_sales numeric := accept_partner_view.partner_sales;
  v_partner_paid numeric := accept_partner_view.partner_paid;
  v_contact_id uuid := accept_partner_view.contact_id;
  trip_org_id uuid;
  first_contact_id uuid;
  first_contact_type text;
  first_party_name text;
BEGIN
  IF NOT public.is_org_member(v_org_id) THEN
    RETURN;
  END IF;

  SELECT t.organization_id INTO trip_org_id
  FROM public.trips t
  WHERE t.id = v_trip_id;

  SELECT tr.contact_id, tr.contact_type, tr.party_name
  INTO first_contact_id, first_contact_type, first_party_name
  FROM public.transactions tr
  WHERE tr.organization_id = v_org_id
    AND tr.trip_id = v_trip_id
    AND (v_contact_id IS NULL OR tr.contact_id = v_contact_id)
  ORDER BY tr.created_at
  LIMIT 1;

  DELETE FROM public.transactions
  WHERE public.transactions.organization_id = v_org_id
    AND public.transactions.trip_id = v_trip_id
    AND (v_contact_id IS NULL OR public.transactions.contact_id = v_contact_id);

  IF trip_org_id IS NOT NULL AND trip_org_id = v_org_id THEN
    UPDATE public.trips t
    SET
      client_price = COALESCE(v_partner_sales, 0),
      supplier_rate = COALESCE(v_partner_sales, 0),
      updated_at = now()
    WHERE t.id = v_trip_id
      AND t.organization_id = v_org_id;
  END IF;

  IF v_partner_paid IS NOT NULL AND v_partner_paid <> 0 THEN
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
      v_org_id,
      v_trip_id,
      COALESCE(first_party_name, 'Ledger update'),
      'Shared ledger sync',
      CASE WHEN v_partner_paid > 0 THEN v_partner_paid ELSE 0 END,
      CASE WHEN v_partner_paid < 0 THEN (-v_partner_paid) ELSE 0 END,
      current_date,
      COALESCE(v_contact_id, first_contact_id),
      first_contact_type
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.accept_partner_view(uuid, uuid, numeric, numeric, uuid) IS
  'Self-correct: update caller org ledger for trip to match partner_sales/partner_paid. Used by Update my book and Accept & Auto-Update Ledger.';
