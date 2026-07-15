-- Fix: assign_aggregate_trip_driver has two overloaded versions live in the DB —
-- a legacy 4-arg one (no p_vehicle_id) and the current 5-arg one (p_vehicle_id
-- DEFAULT NULL) added later via CREATE OR REPLACE. Postgres treats a different
-- parameter list as a new function rather than a replacement, so the legacy
-- overload was never removed.
--
-- Any RPC call that omits p_vehicle_id (every aggregate/ad-hoc "assign driver by
-- phone" deploy that doesn't pick a fleet vehicle by id) is ambiguous between the
-- two overloads and Postgres raises:
--   ERROR 42725: function assign_aggregate_trip_driver(...) is not unique
--
-- The client's retry/fallback logic only handles the reverse case (p_vehicle_id
-- sent but rejected), so this error surfaces as "Driver could not be assigned"
-- and the trip is left permanently unassigned even though it was created.
--
-- Fix: drop the legacy 4-arg overload so only the current 5-arg signature remains.

DROP FUNCTION IF EXISTS public.assign_aggregate_trip_driver(uuid, uuid, text, text);
