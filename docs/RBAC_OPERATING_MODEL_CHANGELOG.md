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
| _(pending)_ | Ownership transfer: owner-only atomic audited RPC (`transfer_organization_ownership`) — demote owner→admin, promote member→owner, sync `organizations.owner_id`; hardened `org_members_update` RLS to block off-RPC `role='owner'`; owner-only "Transfer ownership" action in `MemberEditModal`; workspace refresh re-gates ex-owner |

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

---

## Modified files

| File | What changed |
|------|----------------|
| `lib/capabilities.ts` | Org model flags; finance/party helpers; asset = no indent create; hybrid merge safe; `hasBusinessCapabilities`; `allowedConnectionRoles` (counterparty-aware client/supplier); `operatingModelTransition` (impact preview) |
| `features/organization/services/organization.service.ts` | `changeOperatingModel` RPC wrapper + `looksLikeModelChangeCooldownError` |
| `features/organization/services/members.service.ts` | `transferOwnership` RPC wrapper + `looksLikeTransferTargetError` |
| `features/organization/components/MemberEditModal.tsx` | Owner-only "Transfer ownership" action (`canTransfer`/`onTransfer`); active-member only |
| `features/organization/components/TeamMembersView.tsx` | `handleTransfer` (confirm → RPC → workspace refresh + roster invalidate); `canTransfer={isOwner}` |
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

---

## How to update this file

When you change RBAC again:

1. Add a row under **New files** or **Modified files**.
2. Update the matrix in `docs/RBAC_OPERATING_MODEL.md` if behavior changed.
3. Note the commit hash in **Session / commits** when landed.
