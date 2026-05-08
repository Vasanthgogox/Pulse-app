-- ─────────────────────────────────────────────────────────────────────────────
-- Connection-reducing RPCs
-- Replaces multiple parallel PostgREST calls with single round-trips.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. get_trips_for_org ─────────────────────────────────────────────────────
-- Replaces getTripsByOrganization + getTripsWhereOrgIsSupplier (2 → 1 connection).
-- Returns owned trips UNION supplier trips (via suppliers.linked_organization_id),
-- with indent_number from indents join, deduped by id.
-- SECURITY DEFINER: supplier trips may live in other orgs; RLS would block them.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_trips_for_org(p_org_id uuid)
RETURNS SETOF json
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(q)
  FROM (
    SELECT DISTINCT ON (tr.id)
      tr.*,
      i.indent_number
    FROM trips tr
    LEFT JOIN indents i ON i.id = tr.indent_id
    WHERE tr.organization_id = p_org_id
       OR EXISTS (
         SELECT 1 FROM suppliers s
         WHERE s.id = tr.supplier_id
           AND s.linked_organization_id = p_org_id
       )
    ORDER BY tr.id, tr.created_at DESC
  ) q
  ORDER BY q.created_at DESC
  LIMIT 400;
$$;

GRANT EXECUTE ON FUNCTION get_trips_for_org(uuid) TO authenticated;


-- ─── 2. get_client_detail_bundle ─────────────────────────────────────────────
-- Replaces 4 parallel client-specific calls on ClientDetailScreen (4 → 1 connection).
-- Returns: client row, ratings, warehouses, active contracts.
-- Org-level data (trips, transactions, suppliers, drivers) comes from app cache.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_client_detail_bundle(
  p_org_id   uuid,
  p_client_id uuid
)
RETURNS json
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'client', (
      SELECT row_to_json(c)
      FROM clients c
      WHERE c.id = p_client_id
      LIMIT 1
    ),
    'ratings', (
      SELECT COALESCE(json_agg(r ORDER BY r.created_at DESC), '[]'::json)
      FROM ratings r
      WHERE r.rated_type = 'client'
        AND r.rated_id = p_client_id
    ),
    'warehouses', (
      SELECT COALESCE(json_agg(w), '[]'::json)
      FROM client_warehouses w
      WHERE w.organization_id = p_org_id
        AND w.client_id = p_client_id
    ),
    'contracts', (
      SELECT COALESCE(json_agg(cc ORDER BY cc.created_at ASC), '[]'::json)
      FROM client_contracts cc
      WHERE cc.organization_id = p_org_id
        AND cc.client_id = p_client_id
        AND (cc.valid_to IS NULL OR cc.valid_to >= CURRENT_DATE)
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_client_detail_bundle(uuid, uuid) TO authenticated;


-- ─── 3. get_driver_detail_bundle ─────────────────────────────────────────────
-- Replaces 6 parallel driver-specific calls on DriverDetailScreen (6 → 1 connection).
-- Returns: driver row, ratings, salary requests, ledger, transactions.
-- Trips (org-level) and driver offers come from app cache.
-- Note: get_driver_signup_match_status stays separate (its own SECURITY DEFINER logic).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_driver_detail_bundle(
  p_org_id   uuid,
  p_driver_id uuid
)
RETURNS json
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'driver', (
      SELECT row_to_json(d)
      FROM drivers d
      WHERE d.id = p_driver_id
        AND d.organization_id = p_org_id
      LIMIT 1
    ),
    'ratings', (
      SELECT COALESCE(json_agg(r ORDER BY r.created_at DESC), '[]'::json)
      FROM ratings r
      WHERE r.rated_type = 'driver'
        AND r.rated_id = p_driver_id
    ),
    'salary_requests', (
      SELECT COALESCE(json_agg(sr ORDER BY sr.created_at DESC), '[]'::json)
      FROM driver_salary_requests sr
      WHERE sr.driver_id = p_driver_id
    ),
    'ledger', (
      SELECT COALESCE(json_agg(dl ORDER BY dl.created_at DESC), '[]'::json)
      FROM (
        SELECT * FROM driver_ledger
        WHERE driver_id = p_driver_id
        ORDER BY created_at DESC
        LIMIT 200
      ) dl
    ),
    'transactions', (
      SELECT COALESCE(json_agg(t ORDER BY t.transaction_date DESC, t.created_at DESC), '[]'::json)
      FROM (
        SELECT * FROM transactions
        WHERE organization_id = p_org_id
          AND contact_type = 'driver'
          AND contact_id = p_driver_id
        ORDER BY transaction_date DESC, created_at DESC
        LIMIT 500
      ) t
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_driver_detail_bundle(uuid, uuid) TO authenticated;
