-- Partial index for unlinked client counterparty queries.
-- trips table has client_name but no supplier_name column.
--
-- Rollback: DROP INDEX CONCURRENTLY idx_trips_unlinked_client;

CREATE INDEX IF NOT EXISTS idx_trips_unlinked_client
  ON trips (organization_id, created_at DESC)
  WHERE client_id IS NULL
    AND client_name IS NOT NULL
    AND TRIM(client_name) <> '';
