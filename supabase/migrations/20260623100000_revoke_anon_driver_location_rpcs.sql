-- BUG-6: Driver location RPCs were granted EXECUTE to anon in
-- 20260621100000_driver_location_partner_access.sql. can_access_trip_location
-- returns false for anonymous callers, but anon could still invoke the RPCs
-- (load, timing probes). Restore least-privilege: authenticated only.

REVOKE EXECUTE ON FUNCTION public.get_latest_driver_location_for_trip(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_driver_location_history_for_trip(uuid, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_last_n_locations_for_trip(uuid, int) FROM anon;
