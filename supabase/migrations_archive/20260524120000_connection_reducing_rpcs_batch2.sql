-- ─────────────────────────────────────────────────────────────────────────────
-- Connection-reducing RPCs — Batch 2
-- Reduces parallel DB hits in chat service, POD reconciliation.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. get_trips_for_pod_org ─────────────────────────────────────────────────
-- Replaces 3-way Promise.all in podReconciliationService.mergeTripsForPodOrg:
--   owner trips + get_trips_where_org_is_supplier + get_trips_where_org_is_client
-- Returns trips where org owns, is supplier-linked, or client-linked.
-- SECURITY DEFINER: cross-org visibility for supplier/client roles.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_trips_for_pod_org(p_org_id uuid)
RETURNS SETOF json
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(q)
  FROM (
    SELECT DISTINCT ON (tr.id)
      tr.*
    FROM trips tr
    WHERE tr.organization_id = p_org_id
       OR EXISTS (
         SELECT 1 FROM suppliers s
         WHERE s.id = tr.supplier_id
           AND s.linked_organization_id = p_org_id
       )
       OR EXISTS (
         SELECT 1 FROM clients c
         WHERE c.id = tr.client_id
           AND c.organization_id = p_org_id
       )
    ORDER BY tr.id, tr.created_at DESC
  ) q
  ORDER BY q.created_at DESC
  LIMIT 5000;
$$;

GRANT EXECUTE ON FUNCTION get_trips_for_pod_org(uuid) TO authenticated;


-- ─── 2. get_integrated_partners ───────────────────────────────────────────────
-- Replaces 2-query Promise.all in chat.service.getIntegratedPartners:
--   suppliers + clients where linked_organization_id IS NOT NULL
-- Returns: { suppliers: [...], clients: [...] }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_integrated_partners(p_org_id uuid)
RETURNS json
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'suppliers', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'company_name', s.company_name,
          'name', s.name,
          'linked_organization_id', s.linked_organization_id
        )
      ), '[]'::json)
      FROM suppliers s
      WHERE s.organization_id = p_org_id
        AND s.linked_organization_id IS NOT NULL
      LIMIT 500
    ),
    'clients', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'name', c.name,
          'linked_organization_id', c.linked_organization_id
        )
      ), '[]'::json)
      FROM clients c
      WHERE c.organization_id = p_org_id
        AND c.linked_organization_id IS NOT NULL
      LIMIT 500
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_integrated_partners(uuid) TO authenticated;


-- ─── 3. get_supplier_trip_ids_for_org ─────────────────────────────────────────
-- Lightweight helper used by chat.service.getConversationsByOrganization.
-- Returns only { trip_id, supplier_id } — avoids fetching full trip rows
-- when only IDs are needed to query trip_conversations.
-- SECURITY DEFINER: supplier trips live in other orgs; RLS would block them.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_supplier_trip_ids_for_org(p_org_id uuid)
RETURNS json
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(
    json_build_object('trip_id', tr.id, 'supplier_id', tr.supplier_id)
  ), '[]'::json)
  FROM trips tr
  WHERE EXISTS (
    SELECT 1 FROM suppliers s
    WHERE s.id = tr.supplier_id
      AND s.linked_organization_id = p_org_id
  );
$$;

GRANT EXECUTE ON FUNCTION get_supplier_trip_ids_for_org(uuid) TO authenticated;
