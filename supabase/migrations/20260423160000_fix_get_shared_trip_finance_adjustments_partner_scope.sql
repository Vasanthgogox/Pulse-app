-- Fix Compare & Verify adjustments when the viewer is the supplier (or any side):
-- include partner-org rows tied to bilateral trips + mission keys from BOTH books.

CREATE OR REPLACE FUNCTION public.get_shared_trip_finance_adjustments(
  org_id uuid,
  partner_key uuid
)
RETURNS TABLE (
  id uuid,
  trip_id uuid,
  organization_id uuid,
  type text,
  impact text,
  amount numeric,
  reason text,
  mission_key text,
  created_at timestamptz
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
  WITH shared_trip_ids AS (
    SELECT DISTINCT tr.trip_id AS tid
    FROM public.transactions tr
    WHERE tr.organization_id = org_id
      AND tr.contact_id = partner_key
      AND tr.trip_id IS NOT NULL
  ),
  partner_trip_ids AS (
    SELECT DISTINCT tr.trip_id AS tid
    FROM public.transactions tr
    WHERE tr.organization_id = partner_org_id_val
      AND counterparty_contact_id IS NOT NULL
      AND tr.contact_id = counterparty_contact_id
      AND tr.trip_id IS NOT NULL
  ),
  mission_keys AS (
    SELECT DISTINCT upper(trim(both FROM COALESCE(z.mk_raw, ''))) AS mk
    FROM (
      SELECT COALESCE(t.display_trip_id::text, t.trip_number::text, '') AS mk_raw
      FROM public.trips t
      WHERE t.id IN (SELECT tid FROM shared_trip_ids)
      UNION ALL
      SELECT COALESCE(t.display_trip_id::text, t.trip_number::text, '') AS mk_raw
      FROM public.trips t
      WHERE t.id IN (SELECT tid FROM partner_trip_ids)
    ) z
    WHERE trim(both FROM COALESCE(z.mk_raw, '')) <> ''
  )
  SELECT
    a.id,
    a.trip_id,
    a.organization_id,
    a.type,
    a.impact,
    a.amount,
    a.reason,
    a.mission_key,
    a.created_at
  FROM public.trip_finance_adjustments a
  WHERE (
    a.organization_id = org_id
    AND a.trip_id IN (SELECT tid FROM shared_trip_ids)
  )
  OR (
    a.organization_id = partner_org_id_val
    AND (
      a.trip_id IN (SELECT tid FROM partner_trip_ids)
      OR (
        a.mission_key IS NOT NULL
        AND trim(both FROM a.mission_key) <> ''
        AND upper(trim(both FROM a.mission_key)) IN (SELECT mk FROM mission_keys)
      )
    )
  )
  ORDER BY a.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_shared_trip_finance_adjustments(uuid, uuid) IS
  'Compare & Verify: adjustments for caller org trips + partner org trips (bilateral tx) + mission_key from both books.';
