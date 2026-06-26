-- Add missing indexes identified during DB health incident (2026-11-01).
-- Root cause: organization_members had 29k+ seq scans, trips had 17k+ seq scans —
-- RLS policies and wallet/salary queries were doing full table scans.
-- Note: CONCURRENTLY removed — safe on a fresh/empty DB (no live traffic during reset).
-- On a live DB with traffic, run these manually with CONCURRENTLY via psql instead.

CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id
  ON organization_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_trips_driver_org
  ON trips(driver_id, organization_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_trips_status_completed
  ON trips(driver_id) WHERE status = 'completed' AND deleted_at IS NULL;

-- Covering index so the fill_driver_commission trigger lookup never hits the heap.
CREATE INDEX IF NOT EXISTS idx_drivers_id_commission
  ON drivers(id) INCLUDE (commission_percent, commission_per_km);
