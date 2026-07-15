-- Drop duplicate/redundant indexes on trips table.
-- Each group below keeps one index and drops the rest with identical column sets.

-- booking_ref: keep trips_booking_ref_key (older), drop trips_booking_ref_unique
DROP INDEX IF EXISTS public.trips_booking_ref_unique;

-- driver_id scalar: keep idx_trips_driver_id, drop idx_trips_status_completed (misnamed duplicate)
DROP INDEX IF EXISTS public.idx_trips_status_completed;

-- (driver_id, organization_id) vs (organization_id, driver_id):
-- idx_trips_driver_org has cols driver_id,organization_id — superseded by idx_trips_org_driver_active (organization_id,driver_id)
-- Keep idx_trips_org_driver_active (org-first = better for org-scoped queries), drop the driver-first one
DROP INDEX IF EXISTS public.idx_trips_driver_org;

-- organization_id scalar: keep idx_trips_organization_id, drop idx_trips_active
DROP INDEX IF EXISTS public.idx_trips_active;

-- (organization_id, client_id): keep idx_trips_org_client, drop idx_trips_client_id (scalar — superseded by composite)
-- Actually keep scalar too for FK lookups; just dedupe the composite
-- idx_trips_org_client and idx_trips_client_id_org_deleted have different col order — keep both
-- No pure (org_id, client_id) duplicate found — skip

-- (organization_id, client_id, indent_id): keep idx_trips_org_client_indent
-- idx_trips_client_id_org_deleted is (client_id, organization_id, deleted_at) — different order, keep

-- (organization_id, client_id, status): only one non-unique — keep idx_trips_client_id_status

-- (organization_id, driver_id, status): only one — keep idx_trips_driver_id_status

-- (organization_id, indent_id, supplier_id): keep idx_trips_org_supplier_indent
-- (organization_id, indent_id, supplier_id, created_at): keep idx_trips_org_indent_supplier_created — superset, covers above
DROP INDEX IF EXISTS public.idx_trips_org_supplier_indent;

-- (organization_id, status): keep idx_trips_status
-- (organization_id, status, pickup_date): keep idx_trips_org_status_date — superset, covers above
DROP INDEX IF EXISTS public.idx_trips_status;

-- (organization_id, supplier_id): keep idx_trips_org_supplier, drop idx_trips_supplier_active (supplier_id,org_id — wrong order)
DROP INDEX IF EXISTS public.idx_trips_supplier_active;

-- (organization_id, trip_number) unique: both are constraints — drop one constraint + the non-unique index
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_org_trip_number_unique;
DROP INDEX IF EXISTS public.idx_trips_org_trip_number;

-- trip_code: trips_trip_code_unique covers idx_trips_trip_code_pattern (unique supersedes non-unique)
DROP INDEX IF EXISTS public.idx_trips_trip_code_pattern;

-- trip_operational_code: same pattern
DROP INDEX IF EXISTS public.idx_trips_trip_operational_code_pattern;

-- (supplier_id, organization_id, deleted_at): idx_trips_supplier_id_org_deleted
-- vs (organization_id, supplier_id, status): idx_trips_supplier_id_status — different, keep both

-- (organization_id, vehicle_id, status): only one — keep idx_trips_vehicle_id_status

-- idx_trips_finance_cover: 7-column covering index — keep, it's unique in purpose
