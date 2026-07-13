-- =============================================================================
-- V2 Audit Fix 5: Add missing FK indexes (PERF-3)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_direct_quotes_driver_id  ON public.direct_quotes (driver_id);
CREATE INDEX IF NOT EXISTS idx_direct_quotes_vehicle_id ON public.direct_quotes (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_indents_owner_user_id    ON public.indents (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_trips_created_by_user_id ON public.trips (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_trips_owner_user_id      ON public.trips (owner_user_id);
