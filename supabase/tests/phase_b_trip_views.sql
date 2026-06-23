-- Phase B regression checks (run in Supabase SQL editor as each role).
--
-- 1) Supplier user (org linked as supplier on indent trips):
--    SELECT * FROM trips_supplier_view LIMIT 5;
--    Expect: rows for their subcontract trips only; no trip_number, organization_id columns.
--
-- 2) Driver user (assigned on trips):
--    SELECT * FROM trips_driver_view LIMIT 5;
--    Expect: only own assigned trips; no booking_ref, trip_number, organization_id columns.
--
-- 3) Shipper/dispatcher user:
--    SELECT trip_number, organization_id, booking_ref FROM trips LIMIT 5;
--    Expect: full base-table columns unchanged.

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trips_supplier_view'
ORDER BY ordinal_position;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trips_driver_view'
ORDER BY ordinal_position;
