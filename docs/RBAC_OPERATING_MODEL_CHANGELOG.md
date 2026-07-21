# Operating model RBAC — change log

Track **new** vs **modified** files for Asset / Aggregate / Hybrid RBAC work.  
Update this table whenever RBAC behavior or gates change.

Canonical matrix: [`docs/RBAC_OPERATING_MODEL.md`](./RBAC_OPERATING_MODEL.md)

---

## Session / commits

| Commit | Summary |
|--------|---------|
| `943c7241` | `useCapabilities` + ModelAccessGate + finance/trip/party/supplier/vehicle gates |
| `3af2fdaf` | Party directory gate; give-load blocked for asset; nav policy + capability merge fix |
| `6cef06c4` | Docs + cursor rule: operating model blueprint |
| `e1670210` | Org KYC reminder: `hasBusinessCapabilities` instead of `role !== 'driver'` |
| _(pending)_ | Network page: counterparty-aware connect roles; asset hides supplier tab/count/create-post; aggregate hides driver (FLEET) tab/count |
| _(pending)_ | Operating-model switching: owner-only, 30-day cooldown, audited RPC; impact-preview modal; capability re-gate with no data loss |
| _(pending)_ | Desktop hub sub-panels (details / hero / grow) gated on `canAccessSuppliers`/`canAccessDrivers`; `database.types.ts` regen (change_operating_model RPC + operating_model_changed_at); Hybrid model verified full-union (no gates to add, covered by tests) |
| _(pending)_ | Ownership transfer: owner-only atomic audited RPC (`transfer_organization_ownership`) — demote owner→admin, promote member→owner, sync `organizations.owner_id`; hardened `org_members_update` RLS to block off-RPC `role='owner'`; owner-only "Transfer ownership" on member access page; workspace refresh re-gates ex-owner |
| _(pending)_ | Owner-only Access Control page: dedicated owner-gated screen (`app/(modals)/access-control.tsx`) reusing `TeamMembersView`; role writes routed through new owner-only, atomic, audited `set_member_role` RPC; `org_members_update` RLS hardened so role/permission changes are owner-only (admins can no longer re-role teammates off-RPC); owner-only "Access" entry in `WorkspaceTeamPanel` |
| _(pending)_ | Part 2: functional member roles (Finance/Sales/TripOps) — invite roles replace Planner/Operator; `permissions.platformRole` now read into `ActiveWorkspaceContext`; new `useMemberCapabilities()` intersects org model with functional role (owner/admin bypass); client-side gate on the 3 primary tabs only (`MemberDomainGate`) — no RLS change, no DB migration (reuses existing `organization_members.permissions` column and legacy `role` CHECK values) |
| _(pending)_ | Part 3: per-member access page — Edit opens `/(modals)/member-permissions` (two-column: identity left, presets/domains right); replaces `MemberEditModal`; remove + transfer + role/domains save live on that page |

---

## New files

| File | Purpose |
|------|---------|
| `lib/useCapabilities.ts` | Hook: profile + org `operatingModel` → capabilities |
| `components/ModelAccessGate.tsx` | Soft route gate (suppliers / vehicles / drivers / clients) |
| `lib/__tests__/capabilities.operatingModel.test.ts` | Unit tests for ASSET / NON_ASSET / HYBRID |
| `docs/RBAC_OPERATING_MODEL.md` | Who-can-do-what matrix |
| `docs/RBAC_OPERATING_MODEL_CHANGELOG.md` | This change log |
| `.cursor/rules/pulse-operating-model-rbac.mdc` | Cursor rule for RBAC sessions |
| `supabase/migrations/20261207160000_discover_organizations_expose_operating_model.sql` | RPC returns `operating_model` for counterparty-aware connect roles |
| `supabase/migrations/20261208120000_change_operating_model.sql` | `operating_model_changed_at` col + owner-only, cooldown-guarded, audited `change_operating_model` RPC |
| `features/organization/components/workspace/ChangeOperatingModelModal.tsx` | Owner-only model picker with downgrade impact preview |
| `supabase/migrations/20261210120000_transfer_organization_ownership.sql` | Owner-only atomic ownership-transfer RPC + `org_members_update` RLS hardening (no off-RPC `role='owner'`) |
| `supabase/migrations/20261212090000_set_member_role_owner_only.sql` | Owner-only `set_member_role(p_member_id, p_role, p_permissions)` SECURITY DEFINER RPC (rejects non-owner + owner-row reassignment, audits `member.role_update`); `member_role_permissions_unchanged()` helper; `org_members_update` RLS now requires owner to change role/permissions (no self-reference — uses helpers to avoid the `20261211090000` recursion class) |
| `app/(modals)/access-control.tsx` | Owner-only Access Control screen — gates on `useOrgRole().isOwner`, renders `TeamMembersView` with `canManage={isOwner}`; "Owner access only" notice for non-owners |
| `supabase/migrations/20261211090000_fix_org_members_policy_recursion.sql` | Fix infinite-recursion in `org_members_update`/`org_members_insert` (self-referenced `organization_members` inside its own policy → every UPDATE/INSERT 500'd). New `is_org_owner()` SECURITY DEFINER helper; policies now use `is_org_admin()`/`is_org_owner()` instead of inline self-subqueries. Same authz intent |
| `lib/useMemberCapabilities.ts` | Hook: `useCapabilities()` (org model) ∩ member domains (or legacy single functional role) → `{ finance, sales, tripops }`; owner/admin bypass |
| `components/MemberDomainGate.tsx` | Client-side redirect-on-deny gate for the Fiscal/Trips/Network tabs (same pattern as `ModelAccessGate`) |
| `app/(modals)/member-permissions.tsx` | Owner-only per-member domain permission detail screen (`?memberId=`) |
| `features/organization/components/MemberPermissionsPanel/MemberPermissionsPanel.tsx` | KYC-style WorkspaceDetailLayout page: role presets + domain Switch rows + save via `updateMemberPermissions` |
| `features/organization/components/MemberPermissionsPanel/DomainPermissionToggleRow.tsx` | Expandable domain row (Switch + grants chips), mirrors KycRequiredDocumentRow |

---

## Modified files

| File | What changed |
|------|----------------|
| `lib/capabilities.ts` | Org model flags; finance/party helpers; asset = no indent create; hybrid merge safe; `hasBusinessCapabilities`; `allowedConnectionRoles` (counterparty-aware client/supplier); `operatingModelTransition` (impact preview) |
| `features/organization/services/organization.service.ts` | `changeOperatingModel` RPC wrapper + `looksLikeModelChangeCooldownError` |
| `features/organization/services/members.service.ts` | `transferOwnership` RPC wrapper + `looksLikeTransferTargetError`; `updateMemberRole` → `set_member_role`; new `updateMemberPermissions` for domain toggles + `looksLikeNotOwnerError` |
| `lib/routes.ts` | `MODALS.ACCESS_CONTROL` + `MODALS.MEMBER_PERMISSIONS` |
| `app/(modals)/_layout.tsx` | Register `access-control` + `member-permissions` fullScreenModal screens |
| `features/organization/components/workspace/WorkspaceTeamPanel.tsx` | Owner-only "Access" button → `ROUTES.MODALS.ACCESS_CONTROL` |
| `features/network/components/desktop/NetworkDesktopTeamPanel.tsx` | Owner-only "Access" button (network hub Team tab) → `ROUTES.MODALS.ACCESS_CONTROL` |
| `lib/navigationPolicy/registry/org.ts` | `org.modal-access-control` + `org.modal-member-permissions` policies |
| `features/organization/components/TeamMembersView.tsx` | Edit → member-permissions modal (no `MemberEditModal`); phone-invite cancel stays local |
| `features/organization/utils/teamInviteRoles.util.ts` | `MemberDomainFlags`, `domains` on permissions, domain helpers, `buildPermissionsFromDomains` |
| `contexts/ActiveWorkspaceContext.tsx` / `types/workspace.ts` | Expose `memberDomains` from permissions |
| `lib/useMemberCapabilities.ts` | Prefer `memberDomains` (multi-domain) over single functional role |
| ~~`features/organization/components/MemberEditModal.tsx`~~ | Removed — superseded by `MemberPermissionsPanel` |
| `features/organization/components/workspace/WorkspaceSettingsPanel.tsx` | Owner-only editable Operating Model field → opens modal; refresh + `['q',…]` cache purge on switch |
| `features/organization/components/workspace/workspacePanelUi.tsx` | `panelFieldHint` style |
| `features/network/screens/NetworkScreen.tsx` | Asset: hide supplier tab/count/create-post, connect as client only. Aggregate: hide DRIVER tab + FLEET count. Empty-role connect blocked with alert |
| `features/network/components/desktop/NetworkDesktopHub.tsx` | Hub stats: drop SUPPLIERS tile (asset) / FLEET tile (aggregate) via `canAccessSuppliers`/`canAccessDrivers`. Zero gated counts (`gatedSupplierCount`/`gatedDriverCount`) into details/hero/grow sub-panels so no hidden-surface count leaks |
| `lib/database.types.ts` | Regenerated — adds `change_operating_model` RPC + `organizations.operating_model_changed_at` |
| `features/network/components/ConnectionRoleModal.tsx` | `allowedRoles` prop; preselect + render only valid roles |
| `features/network/components/StoryReel.tsx` | `canCreatePost` prop; hide create bubble/`+` badge for asset |
| `features/network/components/DiscoverView.tsx` | Connect modal gated by `allowedConnectionRoles`; empty-role connect blocked |
| `features/network/services/discover.service.ts` | `DiscoverOrg.operating_model` field; threaded from RPC |
| `lib/__tests__/capabilities.operatingModel.test.ts` | `allowedConnectionRoles` cases (asset→aggregate, asset→asset empty, etc.) |
| `features/organization/components/workspace/kyc/OrgVerificationReminderProvider.tsx` | Gate via `useCapabilities` + `hasBusinessCapabilities` (no `profile.role`) |
| `lib/navigationPolicy/grants.ts` | `operatingModel` arg on grant set |
| `lib/navigationPolicy/NavigationPolicyProvider.tsx` | Passes `operatingModel` into principal |
| `lib/navigationPolicy/NavigationPolicyShadowHost.tsx` | Reads org operating model |
| `lib/navigationPolicy/registry/org.ts` | Supplier/`create-indent` = `dispatch`; party kind policies; vehicle = fleet |
| `lib/navigationPolicy/__tests__/grants.test.ts` | Operating-model override test |
| `features/auth/services/auth.service.ts` | Signup writes profile flags; refresh prefers metadata model |
| `features/finance/components/FinanceScreen.tsx` | Tab / ledger / party / vehicle filters by caps |
| `features/finance/components/FinanceTabRow.tsx` | Optional visible tabs |
| `features/finance/components/FinanceTabBody.tsx` | Mounts only allowed tabs |
| `features/finance/components/FinanceTabBody.types.ts` | `visibleTabs` / kanban columns |
| `features/finance/components/FinanceSummarySection.tsx` | Passes visible tabs + ledger categories |
| `features/finance/components/TreasurySummaryCard.tsx` | Allowed ledger categories |
| `features/finance/components/EntityListCategoryModal.tsx` | Allowed categories prop |
| `features/finance/components/FinanceKanbanTab.tsx` | Visible columns |
| `features/finance/components/finance-tabs/FinanceCashKanbanPanel.tsx` | Kanban columns from caps |
| `features/trips/screens/TripsScreen.tsx` | `useCapabilities` |
| `features/trips/components/add-trip/AddTripModal.tsx` | Allowed supply modes |
| `features/trips/components/add-trip/AddTripFormFields.tsx` | Passes `allowedSupplyModes` |
| `features/trips/components/add-trip/useAddTripForm.ts` | Initial supply source |
| `features/trips/components/SupplyAllocationModeBar.tsx` | Own fleet / Partner fleet labels |
| `features/trips/components/TripExpandableCard.tsx` | `useCapabilities` |
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | `useCapabilities` |
| `features/indents/components/IndentDetailScreen.tsx` | No give-load/broadcast/share for asset |
| `features/party/components/PartyDirectoryScreen.tsx` | Filtered tabs + queries |
| `app/party/[kind].tsx` | `ModelAccessGate` by kind |
| `app/supplier/[id].tsx` (+ profile/analytics) | Supplier gate |
| `app/vehicle/[id].tsx` (+ profile/analytics) | Vehicle gate |
| `features/suppliers/screens/AddSupplierScreen.tsx` | Bounce if no suppliers |
| `features/vehicles/screens/AddVehicleScreen.tsx` | Bounce if no vehicles |
| `components/profile/WorkspaceHubMenu.tsx` | Party rows by caps |
| `app/(tabs)/clients.tsx` | `useCapabilities` |
| `app/create-indent/index.tsx` | Caps via hook (create blocked for asset) |
| `features/clients/components/ClientDetailScreen.tsx` | `useCapabilities` |
| `features/suppliers/components/SupplierDetailScreen.tsx` | `useCapabilities` |
| `features/drivers/components/DriverDetailScreen.tsx` | `useCapabilities` |
| `features/vehicles/components/VehicleDetailScreen.tsx` | `useCapabilities` |
| `features/organization/screens/ProfileScreen.tsx` | `useCapabilities` |
| `features/invoicing/InvoicingExecuteScreen.tsx` | Caps via hook (valid hooks) |
| `app/invoicing/pdf-preview.tsx` | Caps via hook |
| `features/pod-reconciliation/PodReconciliationScreen.tsx` | Caps via hook |
| `features/log-pods/LogIncomingPodsScreen.tsx` | Caps via hook |
| `CLAUDE.md` | Points to RBAC docs |
| `.cursor/rules/pulse-standards.mdc` | Points to operating-model RBAC |
| `features/organization/utils/teamInviteRoles.util.ts` | `PlatformTeamRole` adds `finance`/`sales`/`tripops` (planner/operator kept for legacy-row display only); `TEAM_INVITE_ROLE_OPTIONS` now Admin/Finance/Sales/TripOps; `orgMemberRoleForPlatformRole` maps finance→`finance`, sales→`member`, tripops→`dispatcher`; new `FunctionalRole` type + `functionalRoleFromPlatformRole()` |
| `features/organization/components/InviteMemberModal.tsx` | Default `selectedRole` → `"tripops"` (was `"operator"`, now retired from the picker) |
| ~~`features/organization/components/MemberEditModal.tsx`~~ | Removed — edit now opens `MemberPermissionsPanel` |
| `contexts/ActiveWorkspaceContext.tsx` | Selects `permissions` from `organization_members`; new `platformRoleMap` (parallel to `roleMap`) + `memberPlatformRole` state, derived via `platformRoleFromMember`, set in `loadWorkspaces` and `switchWorkspace` |
| `types/workspace.ts` | `ActiveWorkspaceState.memberPlatformRole: PlatformTeamRole \| null` |
| `app/(tabs)/finance.tsx` | Wrapped in `<MemberDomainGate kind="finance">` |
| `app/(tabs)/trips.tsx` | Wrapped in `<MemberDomainGate kind="tripops">` |
| `app/(tabs)/network/index.tsx` | Wrapped in `<MemberDomainGate kind="sales">` |

---

## Known gaps (Part 2 — functional member roles)

- **Rollout behavior change**: any existing non-admin member with no `permissions.platformRole` set (plain legacy `member`, or a pre-existing Planner/Operator invite) now gets **zero** Fiscal/Trips/Network tab access until the owner explicitly assigns Finance/Sales/TripOps. This was a deliberate strict-default choice, not an oversight — flag it before shipping.
- **Scope is nav/tab-entry only** — the ~30 existing `useCapabilities()` call sites inside individual screens (sub-tabs, ledger categories, party detail screens, etc.) are untouched and remain org-model-only. A functional-role member who is inside an allowed tab still sees the same content an Admin would see for that org model.
- No RLS/database-level enforcement; no CHECK-constraint migration (new roles map onto existing legal `role` values).

### Follow-up fixes (landing + tab visibility)

Resolved three defects reported after the first pass, where a functional-role member landed on the wrong screen:

- **Role-aware redirect target.** `MemberDomainGate` no longer bounces a denied member to the neutral Profile tab. It now redirects to the member's own home tab via `memberHomeRouteFromAccess()` (`lib/useMemberCapabilities.ts`): TripOps → Trips, Finance → Fiscal, Sales → Network. This fixes a TripOps member cold-booting onto a persisted/default Fiscal or Network route and getting parked on Profile.
- **No-access notice instead of a blank frame.** A member with no reachable domain (no functional role) has nowhere to redirect, so the gate now renders a themed "No workspace access yet" notice (i18n `memberNoAccessTitle` / `memberNoAccessBody`) rather than an empty `<View>`.
- **Denied tabs are now hidden from the dock.** `DemoTabBar` (desktop top nav) and `PulseBottomTabBar` (mobile footer) take an optional `visibility` prop, wired from `useMemberCapabilities()` in `app/(tabs)/_layout.tsx`. A member only sees the primary tabs their role can reach; the dock highlight also falls back to the member's home tab (not a hard-coded `trips`) when the current route isn't a primary tab, fixing the "Trips highlighted while URL is /profile" desync. Owner/Admin are unaffected — all three tabs stay visible. While access is still resolving, all tabs stay visible to avoid a flicker (the per-tab gate holds the screen).

## How to update this file

When you change RBAC again:

1. Add a row under **New files** or **Modified files**.
2. Update the matrix in `docs/RBAC_OPERATING_MODEL.md` if behavior changed.
3. Note the commit hash in **Session / commits** when landed.
