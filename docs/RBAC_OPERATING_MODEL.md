# Operating model RBAC (Asset / Aggregate / Hybrid)

**Source of truth for “who can do what” by org operating model.**  
Load this doc in any session that touches access, finance tabs, create-trip, give-load, suppliers, garage, or route guards.

| Related | Path |
|---------|------|
| Capability engine | `lib/capabilities.ts` |
| React hook (prefer this) | `lib/useCapabilities.ts` |
| Route soft-gate (operating model) | `components/ModelAccessGate.tsx` |
| Route soft-gate (single surface) | `components/SurfaceAccessGate.tsx` |
| Functional role ∩ org model hook | `lib/useMemberCapabilities.ts` |
| Functional role route soft-gate | `components/MemberDomainGate.tsx` |
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

1. Prefer `useCapabilities()` for org-model helpers; add `useMemberAccess().can(surfaceId)` when two actions share a Capability.
2. Gate UI with helpers: `canAccessSuppliers`, `canAccessVehicles`, `canUseAssetSupply`, `canUseAggregateSupply`, `canAccessFinanceSubTab`, `canAccessPartyKind` **and** the matching surface id from `MEMBER_SURFACE_CATALOG`.
3. Wrap party routes with `ModelAccessGate` (`components/ModelAccessGate.tsx`). For a screen governed by one surface id, wrap with `SurfaceAccessGate surface="…"`; nest it *inside* `ModelAccessGate` when both axes apply. For an action inside an already-allowed screen, call `useMemberAccess().can(id)` at the call site instead of nesting a gate.
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
- UI: owner-only "Transfer ownership" on the member access page (`MemberPermissionsPanel`), opened from team Edit

---

## Functional member roles (Finance / Sales / TripOps)

A second, orthogonal RBAC axis layered on top of the operating model above. Owner/Admin are unaffected (full access, org-model-gated only, as before). A non-admin member’s effective nav access is the **intersection**: org model allows it **AND** the member’s domain flags cover that tab.

| Domain | Tab | Legacy `organization_members.role` (coarse storage when primary) |
|--------|-----|------------------------------------------------------------------|
| Finance | Fiscal tab (cash, ledgers, invoicing) | `finance` |
| Sales | Network tab (marketplace, clients, connections) | `member` |
| TripOps | Trips tab (dispatch, indents, trip execution) | `dispatcher` |

- Storage lives in `organization_members.permissions` jsonb: `{ platformRole, grants, domains?, surfaces? }`.
  - `platformRole` — preset label (admin / finance / sales / tripops); still used for invite UI and coarse `role` column mapping.
  - `domains` — optional `{ finance, sales, tripops }` booleans (derived from surfaces when present).
  - `surfaces` — **Part 4** drill-down map (`MemberSurfaceId` → boolean). Catalog: `lib/memberSurfaces.ts`. Enforcement: `useMemberAccess().can(id)` for actions that share a Capability (create indent vs create trip, finance sub-tabs, assign, etc.). `useCapabilities()` soft-filters Cap tokens implied by enabled surfaces for coarse helpers.
  - `grants` — display/cosmetic colon-namespaced tokens (still not the Capability enforcement vocabulary).
- Owner edits surfaces on **Member access** (`app/(modals)/member-permissions?memberId=`) — domain master switches + nested action toggles. Write path: `updateMemberPermissions` → `set_member_role` RPC (owner-only, audited).
- `ActiveWorkspaceContext` exposes `memberPlatformRole`, `memberDomains`, and `memberSurfaces`.
- `useMemberCapabilities()` intersects org model with domains for primary tab entry (`MemberDomainGate`).
- Owner / org-role admin / `platformRole === "admin"` bypass member surface filtering (org model only).
- **Strict default:** a member with no domains/surfaces enabled gets **no** domain access until the owner assigns access via Invite / Edit / Member access.
- Surfaces unavailable for the org operating model render locked in the permission UI.

---

## Department Manager (surface-only delegation)

A narrow, opt-in delegation on top of the owner-only model above — the owner can let one member per department edit *surface* toggles for their own teammates, without becoming an org admin.

| Aspect | Rule |
|--------|------|
| Grant | `permissions.isDepartmentManager: true` — **owner-only** to set, via the existing owner-only `set_member_role` RPC (same as any other permissions field). Toggle lives in Member Access. |
| Scope | Manager can edit `permissions.surfaces` only, only for members whose `permissions.platformRole` matches the manager's own. Cannot change `platformRole`, `domains`, `grants`, or `isDepartmentManager` itself — cannot touch owner/admin rows — cannot edit their own row. |
| Write path | `set_member_surfaces_as_manager(p_member_id, p_surfaces)` RPC (SECURITY DEFINER) — a second, narrower function alongside `set_member_role`; merges only the `surfaces` key. Service: `updateMemberSurfacesAsManager` in `features/organization/services/members.service.ts`. |
| UI | `MemberPermissionsPanel` — `canEditAsManager` gates edit rights for non-owners; role-preset tiles and domain master switches stay locked (`canEditRolePreset`, owner-only) — a manager only sees the leaf surface toggles as editable. |
| Audit | `workspace_audit_log` event `member.surfaces_update_by_manager` `{member_id, department, surfaces}`. |
| Migration | `supabase/migrations/20270220120000_department_manager_surface_write.sql` |

**Example:** a Finance Manager (Priya) can toggle `finance.garage.edit` on for another Finance member (Ayush), but cannot touch a Sales member (Meera), cannot promote Ayush to Finance Manager, and cannot grant herself any surface outside Finance.

## Owner-only Access Control

Role/access changes are **owner-only** and enforced server-side.

| Aspect | Rule |
|--------|------|
| Surface | `app/(modals)/access-control.tsx` — owner-gated (`useOrgRole().isOwner`); reuses `TeamMembersView`. Non-owners see "Owner access only". Entry: owner-only "Access" button in `WorkspaceTeamPanel`. |
| Write path | `updateMemberRole` → `set_member_role(p_member_id, p_role, p_permissions)` RPC (SECURITY DEFINER, owner-only, atomic, audited). Owner-row reassignment rejected — use ownership transfer. |
| RLS backstop | `org_members_update` `WITH CHECK` now allows a role/permission change only when caller `is_org_owner`; admins keep other-column edits, self-row invite accept/reject unaffected. No self-reference (uses `is_org_owner`/`member_role_permissions_unchanged` helpers) to avoid the recursion class fixed in `20261211090000`. |
| Audit | `workspace_audit_log` event `member.role_update` `{member_id, from, to}`. |
| Migration | `supabase/migrations/20261212090000_set_member_role_owner_only.sql` |

## Manual test (quick)

| Persona | Check |
|---------|--------|
| Asset | Finance has no Suppliers; Create Trip = Own fleet; `/create-indent` denied; `/add-supplier` bounces |
| Aggregate | Finance has no Garage; Create Trip = Partner fleet; `/add-vehicle` bounces; give-load works |
| Hybrid | Both supply modes; Suppliers + Garage tabs; create indent works |
| Model switch | Owner sees "Tap to change" on Operating Model; non-owner sees read-only; downgrade shows impact preview; 2nd change within 30d blocked; surfaces re-gate without reload |
| Finance role | Sees Fiscal tab only; direct nav to `/trips` or `/network` bounces back |
| Sales role | Sees Network tab only; direct nav to `/finance` or `/trips` bounces back |
| TripOps role | Sees Trips tab only; direct nav to `/finance` or `/network` bounces back |
| No functional role | All 3 tabs bounce back (strict default) until owner assigns one |
| Owner/Admin | All 3 tabs unaffected regardless of functional role |
