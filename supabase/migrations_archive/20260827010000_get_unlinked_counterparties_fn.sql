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

-- Initial stub — recreated correctly in 20260828020000_analytics_rpcs.sql
-- (counterparty_resolutions table not yet created at this migration point,
--  and trips has no supplier_name column)
CREATE OR REPLACE FUNCTION get_unlinked_counterparties(p_org_id uuid)
RETURNS TABLE (
  counterparty_name text,
  counterparty_type text,
  trip_count        bigint,
  last_trip_date    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH membership_check AS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
    LIMIT 1
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
  )
  SELECT counterparty_name, counterparty_type, trip_count, last_trip_date
  FROM unlinked_clients
  ORDER BY trip_count DESC, last_trip_date DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION get_unlinked_counterparties(uuid) TO authenticated;
