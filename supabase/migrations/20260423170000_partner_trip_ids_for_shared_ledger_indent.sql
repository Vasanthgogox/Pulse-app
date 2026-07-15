-- Resolve partner-org trip UUIDs that share the same indent as the viewer's focused trip.
-- Used by Shared Ledger drill-down so client vs supplier TRP labels (per-org sequences)
-- no longer hide partner-authored trip_finance_adjustments under "They record".

CREATE OR REPLACE FUNCTION public.get_partner_trip_ids_for_shared_ledger_focus(
  org_id uuid,
  partner_key uuid,
  viewer_trip_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_org_id_val uuid;
  indent_id_val uuid;
BEGIN
  IF NOT public.is_org_member(org_id) THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT COALESCE(
    (SELECT c.linked_organization_id FROM public.clients c WHERE c.id = partner_key AND c.organization_id = org_id AND c.linked_organization_id IS NOT NULL LIMIT 1),
    (SELECT s.linked_organization_id FROM public.suppliers s WHERE s.id = partner_key AND s.organization_id = org_id AND s.linked_organization_id IS NOT NULL LIMIT 1)
  ) INTO partner_org_id_val;

  IF partner_org_id_val IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT t.indent_id INTO indent_id_val
  FROM public.trips t
  WHERE t.id = viewer_trip_id
    AND t.organization_id = org_id
  LIMIT 1;

  IF indent_id_val IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  RETURN COALESCE(
    ARRAY(
      SELECT t2.id
      FROM public.trips t2
      WHERE t2.organization_id = partner_org_id_val
        AND t2.indent_id = indent_id_val
    ),
    ARRAY[]::uuid[]
  );
END;
$$;

COMMENT ON FUNCTION public.get_partner_trip_ids_for_shared_ledger_focus(uuid, uuid, uuid) IS
  'Shared Ledger Compare: partner trip ids sharing indent with viewer trip (cross-org TRP labels).';

REVOKE ALL ON FUNCTION public.get_partner_trip_ids_for_shared_ledger_focus(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_partner_trip_ids_for_shared_ledger_focus(uuid, uuid, uuid) TO authenticated;
