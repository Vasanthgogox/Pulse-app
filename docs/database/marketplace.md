# Database — Marketplace & Social

## indents
Load board requests.
```
id, organization_id, origin, destination, load_type, price, status
trip_id (if matched)
```

## network_posts / network_bids / network_follows
Social layer for the Network tab.

## Capabilities (access control)
```
getEffectivePermissions(capabilities) → EffectivePermissions
  → { canAccessIndents, canAccessTrips, canAccessVehicles, canManageFinance, ... }

getCapabilitiesFromProfile(profile) → Capability[]
  Capability = "fleet_management" | "dispatch" | "marketplace_post" |
               "marketplace_bid" | "finance_view" | "finance_manage" | "team_manage"
```
File: `lib/capabilities.ts`

## Operating Models
- `ASSET_BASED` — fleet + dispatch + marketplace
- `NON_ASSET` — dispatch + marketplace_post only
- `HYBRID` — all capabilities
