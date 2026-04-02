# Ad-hoc vehicle number on trips (aggregate / doc flow)

For **aggregate trips**, the dispatcher can assign a driver and vehicle in "Change assignment". The vehicle can be from the fleet (`vehicle_id`) or **ad-hoc** (free text, e.g. partner truck not in our fleet). We store ad-hoc on the trip as `vehicle_display_number` so it persists after refresh.

## Behaviour

| Case | Stored on trip |
|------|----------------|
| Vehicle from fleet | `vehicle_id` set → trigger fills `vehicle_display_number` from `vehicles`. |
| Ad-hoc vehicle | `vehicle_id` null, `vehicle_display_number` = entered value (e.g. `"TN 23 VD 7890"`). |

## Migration

`supabase/migrations/20250324120000_trips_allow_adhoc_vehicle_display_number.sql` updates the trigger so that when `vehicle_id` is null we **do not** set `vehicle_display_number := null`, allowing the client to persist an ad-hoc value.

Apply with: `npx supabase db push` (or your usual migration flow).

## App usage

- **TripAssignmentBlock**: sends `vehicle_display_number` when user enters a number that doesn’t match any org vehicle.
- **TripDetailScreen**: shows `trip.vehicle_display_number` when `vehicle_id` is null.
