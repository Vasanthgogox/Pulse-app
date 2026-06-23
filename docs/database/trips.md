# Database — Trips

## trips table
```
id, organization_id, trip_number, display_trip_id
client_id, client_name, supplier_id, supplier_name
driver_id, vehicle_id, driver_display_name, vehicle_display_number
status: pending|assigned|started|completed|cancelled
pickup_area, drop_location, distance, estimated_duration
client_price, supplier_rate, margin, platform_fee, driver_commission
payment_status, amount_paid, advance_paid
pickup_date, started_at, completed_at
indent_id, source, load_type, load_tons
created_by, owner_user_id, assigned_by_user_id
```

## Trips Service API
```
getTripsByOrganization(orgId, opts?) → { error, trips: TripRow[], hasMore }
getTripsWhereOrgIsClient(orgId) → { error, trips }
getTripsWhereOrgIsSupplier(orgId) → { error, trips }
createTrip(data) → { error, trip }
updateTripStatus(tripId, status, userId) → { error }
```
File: `features/trips/services/trips.service.ts`

## Trip Lifecycle Flow
```
1. useTripsQuery(orgId) → queryKeys.trips.list(orgId)
2. getTripsByOrganization(orgId) → supabase().from('trips')
3. RLS validates organization_id
4. Realtime: useRealtimeInvalidation → invalidateQueries on DB change
5. createTrip() → DB insert
6. updateTripStatus() → DB update → Realtime fires → refetch
```
