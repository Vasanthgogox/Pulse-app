# Trip assignment: Private Book vs Shared Network

This app treats **driver/vehicle assignment** like the Fiscal Hub’s **Private Book vs Shared Ledger**:

- **Private Book** — The current user assigned (or last changed) the driver and/or vehicle for the trip.
- **Shared Network** — Another user (e.g. partner, other dispatcher) assigned the driver/vehicle.

So “private” = your assignments; “shared” = assignments made by others in the network.

## Behaviour

1. **Trips list**  
   - Toggle: **Private Book** | **Shared** | **All**.  
   - **Private Book**: trips with no assignment, or last assignment by current user.  
   - **Shared**: trips that have a driver/vehicle and the last assignment was by another user.  
   - Trip cards show a small **Private** or **Shared** badge when the trip has an assignment.

2. **Trip detail**  
   - **Assignment** block shows current pilot/vehicle and a badge: **Private Book**, **Shared Network**, or **Unassigned**.  
   - When the user changes the assignment and saves, an audit row is written with `changed_by` = current user, so the trip becomes **Private** for them.

3. **Audit**  
   - Assignment and reassignment are recorded in `trip_assignment_audit` (when the table exists), with `changed_by` = user who made the change (profiles.id / auth.uid()).  
   - “Last assigner” is derived from the latest assignment/reassignment event per trip.

## Schema (Q-unified-base)

Schema lives in **Q-unified-base**; this repo does not add migrations.

- **`trip_assignment_audit`** (consolidated schema):  
  - `trip_id`, `event_type` ('assignment' | 'reassignment' | 'completed'),  
  - `driver_id_prev` / `driver_id_new`, `vehicle_id_prev` / `vehicle_id_new`,  
  - `changed_at`, **`changed_by`** (references `profiles.id`).  

- In Q-unified-base, `profiles.id` is set from `auth.uid()` on signup, so the app passes `auth.uid()` as `changed_by`.

If `trip_assignment_audit` is missing (e.g. minimal local schema):

- Inserts are no-ops (errors ignored).  
- “Latest assigner” is unknown, so all assigned trips are treated as **Private Book**.

## Edge cases

| Case | Behaviour |
|------|-----------|
| No audit table | All trips with assignment shown as Private; layer filter “Shared” can be empty. |
| Trip has driver/vehicle but no audit row (legacy) | Treated as **Private** so existing data is not shown as “shared” by mistake. |
| User reassigns driver/vehicle | New audit row with `changed_by` = current user → trip becomes **Private** for them. |
| Multiple org members | Each user sees “Private” only for trips they last assigned; others see “Shared” for those. |
| Driver app | Driver sees only their own trips; Private/Shared is for dispatcher/org view. Trips are fetched by `driver_id`; when a trip is reassigned to a new driver, the new driver sees it on their next dashboard load (refetch on focus or app foreground). |
| Unassigned trip | Shown in **Private Book** and **All**; excluded from **Shared** (Shared = assigned by someone else). |

## Files

- **Service**: `features/trips/services/trip-assignment-audit.service.ts` (insert + getLatestByTripIds).  
- **Trips service**: `updateTripAssignment(..., options?: { changedBy, driverIdPrev, vehicleIdPrev })`.  
- **UI**: Trips list toggle and badges in `app/(tabs)/trips.tsx`; Assignment block and badge in `TripAssignmentBlock.tsx` and `TripDetailScreen.tsx`.
