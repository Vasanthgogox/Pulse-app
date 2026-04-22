-- Trip finance adjustments — persisted for Shared Ledger / Compare & Verify (both orgs).
-- mission_key links rows across org-specific trip UUIDs when display ids match.

CREATE TABLE IF NOT EXISTS public.trip_finance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('revenue', 'cost')),
  impact text NOT NULL CHECK (impact IN ('plus', 'minus')),
  amount numeric NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  mission_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS trip_finance_adjustments_trip_id_idx
  ON public.trip_finance_adjustments(trip_id);

CREATE INDEX IF NOT EXISTS trip_finance_adjustments_org_mission_idx
  ON public.trip_finance_adjustments(organization_id, mission_key);

COMMENT ON TABLE public.trip_finance_adjustments IS
  'Trip-level sale/cost adjustments; mission_key aligns partner views across orgs.';

CREATE OR REPLACE FUNCTION public.check_trip_finance_adjustment_org_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = NEW.trip_id
      AND t.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'trip_finance_adjustments: trip_id must belong to organization_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_trip_finance_adjustments_org_match ON public.trip_finance_adjustments;
CREATE TRIGGER tr_trip_finance_adjustments_org_match
  BEFORE INSERT OR UPDATE ON public.trip_finance_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_trip_finance_adjustment_org_match();

ALTER TABLE public.trip_finance_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage trip_finance_adjustments" ON public.trip_finance_adjustments;
CREATE POLICY "Org members manage trip_finance_adjustments"
  ON public.trip_finance_adjustments FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_finance_adjustments TO authenticated;

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
  mission_keys AS (
    SELECT DISTINCT upper(trim(both FROM COALESCE(t.display_trip_id::text, t.trip_number::text, ''))) AS mk
    FROM public.trips t
    WHERE t.id IN (SELECT tid FROM shared_trip_ids)
      AND trim(both FROM COALESCE(t.display_trip_id::text, t.trip_number::text, '')) <> ''
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
    AND a.mission_key IS NOT NULL
    AND trim(both FROM a.mission_key) <> ''
    AND upper(trim(both FROM a.mission_key)) IN (SELECT mk FROM mission_keys)
  )
  ORDER BY a.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_shared_trip_finance_adjustments(uuid, uuid) IS
  'Compare & Verify: adjustments from both orgs for shared trips (trip scope + mission_key match).';

REVOKE ALL ON FUNCTION public.get_shared_trip_finance_adjustments(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_trip_finance_adjustments(uuid, uuid) TO authenticated;
