# Operating model RBAC (Asset / Aggregate / Hybrid)

**Source of truth for “who can do what” by org operating model.**  
Load this doc in any session that touches access, finance tabs, create-trip, give-load, suppliers, garage, or route guards.

| Related | Path |
|---------|------|
| Capability engine | `lib/capabilities.ts` |
| React hook (prefer this) | `lib/useCapabilities.ts` |
| Route soft-gate | `components/ModelAccessGate.tsx` |
| Nav policy grants | `lib/navigationPolicy/registry/org.ts` |
| Change log (new / modified) | `docs/RBAC_OPERATING_MODEL_CHANGELOG.md` |
| Cursor rule | `.cursor/rules/pulse-operating-model-rbac.mdc` |
| Claude pointer | `CLAUDE.md` → Reference Docs |

---

## Models

| Model | DB `organizations.operating_model` | Effective flags | Caps (high level) |
|-------|-------------------------------------|-----------------|-------------------|
| **Asset** | `ASSET_BASED` | `aggregated=false`, `asset=true` | Own fleet trips; no give-load; no suppliers |
| **Aggregate** | `NON_ASSET` | `aggregated=true`, `asset=false` | Give-load + suppliers; no garage / own vehicles |
| **Hybrid** | `HYBRID` | both `true` | Full set |

**Resolution order:** current org `operatingModel` **overrides** stale `profiles.aggregated` / `profiles.asset`. Use `useCapabilities()` in UI — do not call `getCapabilitiesFromProfile(profile)` alone.

---

## Capability matrix (who can do what)

| Action / surface | Asset | Aggregate | Hybrid |
|------------------|:----:|:---------:|:------:|
| Create trip (own truck / Asset mode) | Yes | No | Yes |
| Create trip (partner / Aggregate mode) | No | Yes | Yes |
| Supply mode UI | “Own fleet” only | “Partner fleet” only | Asset + Aggregate toggle |
| Give load (create indent) | **No** | Yes | Yes |
| Broadcast / share load / integrated suppliers strip | **No** | Yes | Yes |
| Finance → Cash | Yes | Yes | Yes |
| Finance → Customers | Yes | Yes | Yes |
| Finance → Suppliers | **No** | Yes | Yes |
| Finance → Garage | Yes | **No** | Yes |
| Finance → Drivers | Yes | **No** | Yes |
| Party hub → Customer | Yes | Yes | Yes |
| Party hub → Supplier | **No** | Yes | Yes |
| Party hub → Driver | Yes | **No** | Yes |
| Party hub → Vehicle | Yes | **No** | Yes |
| `/supplier/*`, `/add-supplier` | Blocked | Allowed | Allowed |
| `/vehicle/*`, `/add-vehicle` | Allowed | Blocked | Allowed |
| `/party/suppliers` | Blocked | Allowed | Allowed |
| `/party/vehicles`, `/party/drivers` | Allowed | Blocked | Allowed |
| `/create-indent` | Blocked | Allowed | Allowed |
| Add transaction → supplier party | **No** | Yes | Yes |
| Add transaction → vehicle expense list | Yes | **No** | Yes |
| Marketplace post | **No** | Yes | Yes |
| Marketplace bid | Yes | **No** | Yes |
| Network → Supplier filter tab + count | **No** | Yes | Yes |
| Network → Driver/FLEET filter tab + count | Yes | **No** | Yes |
| Network → Create post (story `+`) | **No** | Yes | Yes |

---

## Connection roles (counterparty-aware)

When org **A** sends a connect request to org **B**, the offered role(s) depend on **both** operating models. Direction is from A's perspective (`lib/capabilities.ts` → `allowedConnectionRoles`):

- **client** = B gives A loads (A carries) → A can carry *and* B can give load.
- **supplier** = B carries A's loads (B is A's fleet provider) → A can give load *and* B can carry.

| A \ B | Asset | Aggregate | Hybrid |
|-------|:-----:|:---------:|:------:|
| **Asset** | — (block) | client | client |
| **Aggregate** | supplier | — (block) | supplier |
| **Hybrid** | client | supplier | client + supplier |

Empty result → callers block Connect with an alert (never a 0-option modal). Unknown counterparty model → gate by A's model only. B's `operating_model` reaches the client via the `discover_organizations` RPC and the profile snapshot.

---

## Implementation checklist (for future changes)

1. Prefer `useCapabilities()` over raw profile flags.
2. Gate UI with helpers: `canAccessSuppliers`, `canAccessVehicles`, `canUseAssetSupply`, `canUseAggregateSupply`, `canAccessFinanceSubTab`, `canAccessPartyKind`.
3. Wrap party routes with `ModelAccessGate` (`components/ModelAccessGate.tsx`).
4. Keep `lib/navigationPolicy/registry/org.ts` grants aligned (suppliers/`create-indent` → `dispatch` only; vehicles/drivers → `fleet_management`).
5. **Hybrid:** `dispatch` + `dispatch_for_own_fleet` must not wipe indent create — see merge logic in `getEffectivePermissions`.
6. After RBAC changes, update **both** this matrix and `docs/RBAC_OPERATING_MODEL_CHANGELOG.md`.

---

## Manual test (quick)

| Persona | Check |
|---------|--------|
| Asset | Finance has no Suppliers; Create Trip = Own fleet; `/create-indent` denied; `/add-supplier` bounces |
| Aggregate | Finance has no Garage; Create Trip = Partner fleet; `/add-vehicle` bounces; give-load works |
| Hybrid | Both supply modes; Suppliers + Garage tabs; create indent works |
