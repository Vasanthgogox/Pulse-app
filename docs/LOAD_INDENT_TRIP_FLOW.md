# Load → Indent → Trip Flow

## Roles

- **Client / Shipper**: Creates the load (indent), awards to supplier. Does **not** create the trip.
- **Supplier**: Receives the awarded load, creates the trip via "Assign Staff & Deploy" in Claimed.

## Indent Status Flow

| Status      | Meaning                                                                 |
|-------------|-------------------------------------------------------------------------|
| `pending`   | Open for bids; no quotes yet or quotes pending                           |
| `quoted`    | Has quotes; client can award                                             |
| `awarded`   | Client accepted a quote (supplier from quote) or directly assigned supplier. **Supplier creates trip.** |
| `completed` | Trip created; indent closed                                             |
| `cancelled` | Load cancelled                                                          |

## Awarded but No Trip Yet

When status = `awarded` and no trip exists:

- **Shipper view** (GIVE_LOAD / HIRE PARTNER): Shows "Supplier secured" + "Pending". Only "View Detail" is actionable. Shipper does **not** see "Create Trip".
- **Supplier view** (AWARDED / CLAIMED): Shows "Assign Staff & Deploy". Supplier creates the trip here.

## Direct-Assignment Path

When indent has `assigned_supplier_id` (no quote flow): same semantics. Shipper does not create the trip. Supplier must create it from their Claimed view (or equivalent flow for directly-assigned loads).

## UI Locations

- **Network → Load → HIRE PARTNER**: Shipper's loads (give + awarded pending trip). No Create Trip.
- **Network → Load → CLAIMED**: Supplier's awarded loads. "Assign Staff & Deploy" creates the trip.
