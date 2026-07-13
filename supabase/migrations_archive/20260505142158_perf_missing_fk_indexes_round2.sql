-- Basic FK indexes missing from round1 — every FK without an index causes a seq scan
-- on the child table when the parent is queried (ON DELETE CASCADE, JOIN, RLS checks).

-- trips: hot FK columns used in every list query + RLS
CREATE INDEX IF NOT EXISTS idx_trips_organization_id ON public.trips(organization_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id       ON public.trips(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_supplier_id     ON public.trips(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_status          ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_created_at      ON public.trips(created_at DESC);

-- transactions: used in finance queries + wallet balance calcs
CREATE INDEX IF NOT EXISTS idx_transactions_organization_id ON public.transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_trip_id         ON public.transactions(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_created_at      ON public.transactions(created_at DESC);

-- driver_locations: inserted every few seconds per active driver
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id   ON public.driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_trip_id     ON public.driver_locations(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded_at ON public.driver_locations(recorded_at DESC);

-- trip_messages: paginated load per conversation (the 500-row query that caused timeouts)
CREATE INDEX IF NOT EXISTS idx_trip_messages_conversation_id ON public.trip_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_trip_messages_created_at      ON public.trip_messages(created_at DESC);

-- network_messages: similar pattern to trip_messages
CREATE INDEX IF NOT EXISTS idx_network_messages_conversation_id ON public.network_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_network_messages_created_at      ON public.network_messages(created_at DESC);
