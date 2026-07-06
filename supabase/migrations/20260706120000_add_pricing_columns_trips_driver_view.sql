-- trips_driver_view omitted pricing columns entirely, so driverRowToTripRow()
-- always defaulted client_price/supplier_rate/driver_commission/distance to 0,
-- making driver-app EST. EARNINGS always compute to ₹0 for every trip.
CREATE OR REPLACE VIEW public.trips_driver_view
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.driver_id,
  t.driver_display_trip_id,
  t.status,
  t.pickup_area AS pickup_location,
  t.pickup_area AS pickup_address,
  t.pickup_date AS pickup_scheduled_at,
  t.drop_location AS dropoff_location,
  t.drop_location AS dropoff_address,
  NULL::timestamptz AS dropoff_scheduled_at,
  t.notes AS instructions,
  t.vehicle_id,
  t.pickup_lat,
  t.pickup_lon,
  t.drop_lat,
  t.drop_lon,
  t.started_at,
  t.created_at,
  t.updated_at,
  t.client_price,
  t.supplier_rate,
  t.driver_commission,
  t.distance
FROM public.trips t
WHERE t.driver_id IN (
  SELECT d.id
  FROM public.drivers d
  WHERE d.user_id = auth.uid()
);

COMMENT ON VIEW public.trips_driver_view IS
  'Driver-facing trip projection: own assigned trips only; hides booking_ref and shipper operational ids. Includes pricing fields (client_price, supplier_rate, driver_commission, distance) so drivers can see accurate trip earnings.';
