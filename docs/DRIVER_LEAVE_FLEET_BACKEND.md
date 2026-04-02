# Driver leave fleet — Backend contract (Q-unified-base)

For “Leave fleet” and passbook history to work, the backend must provide the following. Schema and migrations live in Q-unified-base; q-mobile calls the RPC and reads `drivers.left_at`.

## Schema

### drivers.left_at

- **Column:** `left_at` (timestamptz, nullable).
- **Meaning:** `NULL` = driver is actively connected to this org; non-null = driver left on that date (connection appears in passbook history only).
- **RLS:** Driver must be able to read their own `drivers` rows **including** where `left_at IS NOT NULL` (so passbook detail and history can load). Trips and driver_ledger for that `driver_id` must remain readable by the driver after they leave.

## RPC

### leave_fleet(p_organization_id uuid)

- **Purpose:** Mark the current user’s driver link to the given org as left (set `left_at = now()`).
- **Auth:** Must run as the driver; enforce `driver.user_id = auth.uid()` and `driver.organization_id = p_organization_id`.
- **Logic:**  
  `UPDATE drivers SET left_at = now() WHERE organization_id = p_organization_id AND user_id = auth.uid() AND left_at IS NULL;`  
  Return success or appropriate error (e.g. no row updated → not linked / already left).
- **Required for mobile:** If this RPC is missing, the app shows “Server is not set up for leaving fleets yet” and leaves the connection in CONNECTED until the backend is updated.

## Summary

1. Add migration: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS left_at timestamptz;`
2. Add RPC `leave_fleet(p_organization_id uuid)` as above.
3. Ensure RLS allows drivers to select their own rows (with or without `left_at`) and to read trips/ledger for their `driver_id`.
