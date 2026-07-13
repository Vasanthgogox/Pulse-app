-- Compatibility fix: some environments do not have trips.display_trip_id.
-- Avoid hard column references in RPCs used by PostgREST.

DROP FUNCTION IF EXISTS public.get_shared_trip_finance_adjustments(uuid, uuid);

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
  created_at timestamptz,
  voided_at timestamptz,
  void_reason text
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
      SELECT COALESCE((to_jsonb(t) ->> 'display_trip_id')::text, t.trip_number::text, '') AS mk_raw
      FROM public.trips t
      WHERE t.id IN (SELECT tid FROM shared_trip_ids)
      UNION ALL
      SELECT COALESCE((to_jsonb(t) ->> 'display_trip_id')::text, t.trip_number::text, '') AS mk_raw
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
    a.created_at,
    a.voided_at,
    a.void_reason
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
  'Compare & Verify: adjustments for caller org trips + partner org trips (bilateral tx) + mission_key from both books. Compatible with schemas that omit trips.display_trip_id.';


CREATE OR REPLACE FUNCTION public.get_driver_phone_active_trip(
  p_phone text,
  p_exclude_trip_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last10 text;
  v_trip_id uuid;
  v_trip_number text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('is_busy', false);
  END IF;

  v_last10 := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  IF length(v_last10) < 10 THEN
    RETURN jsonb_build_object('is_busy', false);
  END IF;

  SELECT t.id, coalesce(nullif(trim((to_jsonb(t) ->> 'display_trip_id')), ''), t.trip_number)
  INTO v_trip_id, v_trip_number
  FROM public.trips t
  JOIN public.drivers d ON d.id = t.driver_id
  WHERE (p_exclude_trip_id IS NULL OR t.id <> p_exclude_trip_id)
    AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10) = v_last10
    AND lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'cancelled', 'done', 'delivered')
  ORDER BY t.updated_at DESC
  LIMIT 1;

  IF v_trip_id IS NULL THEN
    RETURN jsonb_build_object('is_busy', false);
  END IF;

  RETURN jsonb_build_object(
    'is_busy', true,
    'trip_id', v_trip_id,
    'trip_label', coalesce(v_trip_number, 'another active trip')
  );
END;
$$;

COMMENT ON FUNCTION public.get_driver_phone_active_trip(text, uuid) IS
  'Returns whether a phone (last-10 digits) is on another non-terminal trip; SECURITY DEFINER for aggregate allocation busy checks. Compatible with schemas that omit trips.display_trip_id.';
