-- Returns distinct unlinked counterparty names for an org.
-- "Unlinked" = trip row where the FK (supplier_id / client_id) is NULL
-- but the name string is populated — i.e., a real business relationship
-- the platform has no formal record of.
--
-- Security: SECURITY DEFINER with explicit membership check so RLS on
-- trips does not block the aggregation, but callers must be org members.
--
-- Performance: relies on idx_trips_unlinked_supplier / idx_trips_unlinked_client
-- partial indexes from migration 20260827000000.
--
-- Rollback: DROP FUNCTION get_unlinked_counterparties(uuid);

CREATE OR REPLACE FUNCTION get_unlinked_counterparties(p_org_id uuid)
RETURNS TABLE (
  counterparty_name text,
  counterparty_type text,   -- 'supplier' | 'client'
  trip_count        bigint,
  last_trip_date    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH membership_check AS (
    SELECT 1 FROM org_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
    LIMIT 1
  ),
  already_resolved AS (
    -- Suppress names the org has already confirmed or dismissed.
    SELECT counterparty_name, counterparty_type
    FROM counterparty_resolutions
    WHERE org_id = p_org_id
  ),
  unlinked_suppliers AS (
    SELECT
      TRIM(supplier_name)  AS counterparty_name,
      'supplier'::text     AS counterparty_type,
      COUNT(*)             AS trip_count,
      MAX(created_at)      AS last_trip_date
    FROM trips
    WHERE organization_id = p_org_id
      AND supplier_id IS NULL
      AND supplier_name IS NOT NULL
      AND TRIM(supplier_name) <> ''
      AND EXISTS (SELECT 1 FROM membership_check)
    GROUP BY TRIM(supplier_name)
  ),
  unlinked_clients AS (
    SELECT
      TRIM(client_name)   AS counterparty_name,
      'client'::text      AS counterparty_type,
      COUNT(*)            AS trip_count,
      MAX(created_at)     AS last_trip_date
    FROM trips
    WHERE organization_id = p_org_id
      AND client_id IS NULL
      AND client_name IS NOT NULL
      AND TRIM(client_name) <> ''
      AND EXISTS (SELECT 1 FROM membership_check)
    GROUP BY TRIM(client_name)
  ),
  combined AS (
    SELECT * FROM unlinked_suppliers
    UNION ALL
    SELECT * FROM unlinked_clients
  )
  SELECT c.counterparty_name, c.counterparty_type, c.trip_count, c.last_trip_date
  FROM combined c
  WHERE NOT EXISTS (
    SELECT 1 FROM already_resolved r
    WHERE r.counterparty_name = c.counterparty_name
      AND r.counterparty_type = c.counterparty_type
  )
  ORDER BY c.trip_count DESC, c.last_trip_date DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION get_unlinked_counterparties(uuid) TO authenticated;
