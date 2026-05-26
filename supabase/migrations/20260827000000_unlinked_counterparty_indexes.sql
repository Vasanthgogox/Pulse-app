-- Partial indexes for unlinked counterparty queries.
-- Only cover rows where the FK is null and the name field is non-empty.
-- Kept narrow so index size stays proportional to actual unlinked volume.
--
-- Rollback: DROP INDEX CONCURRENTLY idx_trips_unlinked_supplier;
--           DROP INDEX CONCURRENTLY idx_trips_unlinked_client;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_unlinked_supplier
  ON trips (organization_id, created_at DESC)
  WHERE supplier_id IS NULL
    AND supplier_name IS NOT NULL
    AND TRIM(supplier_name) <> '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_unlinked_client
  ON trips (organization_id, created_at DESC)
  WHERE client_id IS NULL
    AND client_name IS NOT NULL
    AND TRIM(client_name) <> '';
