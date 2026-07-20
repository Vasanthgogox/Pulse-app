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

## Changing operating model (post-signup)

Owner-only, cooldown-guarded, audited switch. A change is a **pure capability re-gate** — no DB data is deleted; surfaces the new model can't use are hidden and restored on re-upgrade.

| Aspect | Rule |
|--------|------|
| Who | **Owner only** (`useOrgRole().isOwner`), enforced in RPC + RLS |
| When | Free on upgrades; warn-with-impact-preview on downgrades |
| Cooldown | **30 days** between changes (`organizations.operating_model_changed_at`) |
| Data safety | Nothing deleted; hidden rows stay in DB, reachable again on re-upgrade |
| Audit | `workspace_audit_log` event `model.update` `{from,to}` |
| Propagation | `refreshOrganization()` + purge `['q', …]` query cache so gates re-render |

- RPC: `change_operating_model(p_org_id, p_new_model)` — [migration](../supabase/migrations/20261208120000_change_operating_model.sql)
- Transition helper: `operatingModelTransition(from, to)` in `lib/capabilities.ts` → `{direction, capsLost, capsGained, hiddenSurfaces}`
- UI: `ChangeOperatingModelModal` + owner-gated field in `WorkspaceSettingsPanel`
- **Caveat:** hidden-party outstanding balances still sum into finance "all"/cash totals (no dedicated tab) — the modal warns when this applies.

---

## Transferring ownership

Owner-only, atomic, audited. The current owner picks an **active member**; the owner steps down to **admin** and the member becomes **owner** — both `organization_members.role` rows and `organizations.owner_id` flip in one transaction.

| Aspect | Rule |
|--------|------|
| Who | **Owner only** (`useOrgRole().isOwner`), enforced in the RPC |
| Target | Must be an **active** member (not self, not pending) |
| Atomicity | Single SECURITY DEFINER RPC; `FOR UPDATE` lock on the org row — no two-owner/zero-owner race |
| owner_id sync | RPC writes `owner_id` explicitly (the `sync_organization_owner_from_member` trigger no-ops once it's non-null) |
| RLS backstop | `org_members_update` `WITH CHECK` forbids writing `role='owner'` off-RPC (only the current owner may) |
| Audit | `workspace_audit_log` event `ownership.transfer` `{from_user,to_user}` |
| Propagation | `useActiveWorkspace().refresh()` recomputes `memberRole` (ex-owner drops to admin) + members-query invalidate |

- RPC: `transfer_organization_ownership(p_org_id, p_new_owner_user_id)` — [migration](../supabase/migrations/20261210120000_transfer_organization_ownership.sql)
- Service: `transferOwnership` + `looksLikeTransferTargetError` in `features/organization/services/members.service.ts`
- UI: owner-only "Transfer ownership" action in `MemberEditModal`, wired in `TeamMembersView`

---

## Manual test (quick)

| Persona | Check |
|---------|--------|
| Asset | Finance has no Suppliers; Create Trip = Own fleet; `/create-indent` denied; `/add-supplier` bounces |
| Aggregate | Finance has no Garage; Create Trip = Partner fleet; `/add-vehicle` bounces; give-load works |
| Hybrid | Both supply modes; Suppliers + Garage tabs; create indent works |
| Model switch | Owner sees "Tap to change" on Operating Model; non-owner sees read-only; downgrade shows impact preview; 2nd change within 30d blocked; surfaces re-gate without reload |
