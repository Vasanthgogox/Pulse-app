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
| _(pending)_ | RBAC enhancements: zero-domain fallback → `restricted`, custom presets stored in `organizations.settings`, bulk role assignment, and removed hardcoded driver RBAC limits |
| _(pending)_ | Fix: Team/Workspace surfaces were wrongly gated on `team_manage` (never emitted by org operating-model caps) — now available for any business org so owners can grant invite/audit/settings/KYC/notifications |
| _(pending)_ | Fix: Driver Control screen treated an Aggregate-mode org that only ever assigned an open trip (via a `tracking_only` phone-assignment stub, no real fleet employment) as the driver's employer — fabricating an "Estimated earnings" figure and offering "Attribute to employer" with no salary/commission ever configured. Now excludes `tracking_only` rows from employer resolution and from the earnings-estimate gate, matching the pattern already used everywhere else `tracking_only` is checked (`DriverWalletScreen`, `drivers.service.ts`, `aggregateDrivers.ts`) |
| _(pending)_ | Driver Stories: Pulse story preview (`DriverPulseStoryViewer` + `StoryBroadcastPreview`); `/story-detail` nav experience `public_content` so drivers can open market stories; bid-to-shipper footer banner |
| _(pending)_ | Driver + Fleet Owner Phase 1 foundation: explicit `driver_fleet_owner_profiles` + `enable_driver_fleet_owner` RPC (no personal org); Become Fleet Owner entry in Driver App. Canonical: [`DRIVER_FLEET_OWNER_PHASE1.md`](./DRIVER_FLEET_OWNER_PHASE1.md). Does **not** grant Business create-trip/load/indent. |
| _(pending)_ | Driver + Fleet Owner Phase 1b: separate `owner_vehicles` (`owner_user_id` RLS); My Fleet list/add/detail. Business `public.vehicles` unchanged. No trip/docs/P&L/create-trip. |
| _(pending)_ | Driver + Fleet Owner Phase 2: `owner_vehicle_documents` + private `owner-vehicle-documents` bucket; upload/preview/replace/expiry on vehicle detail. No marketplace/P&L. |
| _(pending)_ | Driver + Fleet Owner Phase 3A: `list_open_marketplace_loads_for_fleet_owner` + Available Loads UI (read-only). No bid/trip create. Explicit `owner_vehicle_id` deferred to 3C. |
| _(pending)_ | Driver + Fleet Owner Phase 3B inspection baseline appended to PRD — Story/Reach reuse; no My Fleet bidding; extend `driver_direct_bids` preferred over new bid tables; capacity Story needs minimal posts authoring extension (no personal org). |
| _(pending)_ | Driver + Fleet Owner Phase **3B.1 integration correction**: Business Give Load Idle capacity / Find vehicles consumes FO `VEHICLE_AVAILABILITY` via existing feed + OpportunityCard; FO Stories reuses same card language; null-org Stories/detail hardened. No bid / Boost. |
| _(pending)_ | **NO-GO security:** lock `get_network_feed(uuid,integer,integer)` EXECUTE to authenticated only (`20270210182000`); Reach Option A deleted-source bid = campaign snapshot (`20270210183000`). Employed-driver role-blind OM RLS tracked only: [`SECURITY_TICKET_EMPLOYED_DRIVER_RLS.md`](./SECURITY_TICKET_EMPLOYED_DRIVER_RLS.md). **Do not start 3B.2 until re-audit green.** |
| _(pending)_ | Plan lock (docs only): Trip Assignment + Counterparty Role + Trip-level Receivable + Driver/Owner Payable — support Fleet Owner→Driver **and** Driver cum Owner; Trip List/Detail payment UX on existing allocation. Canonical: [`DRIVER_TRIP_COMPENSATION_MODEL.md`](./DRIVER_TRIP_COMPENSATION_MODEL.md) Part 5; FO PRD pointer. **No implementation authorized.** |

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
| `supabase/migrations/20270120000000_organizations_settings_jsonb.sql` | Add `settings` JSONB column to `organizations` for custom RBAC presets |
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
| `features/organization/components/MemberPermissionsPanel/MemberPermissionsPanel.tsx` | KYC-style WorkspaceDetailLayout page: role presets + domain Switch rows + save via `updateMemberPermissions`; zero-domain handling; custom preset save/apply UI |
| `features/organization/components/MemberPermissionsPanel/DomainPermissionToggleRow.tsx` | Expandable domain row (Switch + grants chips), mirrors KycRequiredDocumentRow |
| `docs/DRIVER_FLEET_OWNER_PHASE1.md` | Driver App Fleet Owner Phase 1 PRD — identity, RBAC boundary, no personal org |
| `supabase/migrations/20270210103000_enable_driver_fleet_owner_capability.sql` | `driver_fleet_owner_profiles` + `enable_driver_fleet_owner` / `is_driver_fleet_owner` |
| `features/driver/services/driverFleetOwner.service.ts` | Client API for owner capability |
| `lib/queries/useDriverFleetOwnerQuery.ts` | React Query hook for Fleet Owner status |
| `features/driver/components/BecomeFleetOwnerScreen.tsx` | Lightweight Become Fleet Owner onboarding |
| `app/(driver)/become-fleet-owner.tsx` | Route entry |
| `supabase/migrations/20270210114000_create_owner_vehicles.sql` | Personal `owner_vehicles` + owner-only fleet-owner RLS |
| `features/driver/services/ownerVehicles.service.ts` | Owner vehicle CRUD (soft delete) |
| `lib/queries/useOwnerVehiclesQuery.ts` | List/detail queries |
| `features/driver/components/MyFleetScreen.tsx` | My Fleet list |
| `features/driver/components/AddOwnerVehicleScreen.tsx` | Add vehicle (no docs) |
| `features/driver/components/OwnerVehicleDetailScreen.tsx` | Vehicle detail + “Share as Story” deeplink (3B.1) |
| `app/(driver)/my-fleet/*` | My Fleet routes |
| `supabase/migrations/20270210123000_create_owner_vehicle_documents.sql` | Document rows + private owner-vehicle-documents storage |
| `features/driver/services/ownerVehicleDocuments.service.ts` | Upload / signed URL / replace / delete |
| `features/driver/utils/ownerVehicleDocuments.util.ts` | Types + expiry + summary |
| `features/driver/components/OwnerVehicleDocumentsSection.tsx` | Document vault UI |
| `supabase/migrations/20270210133000_list_open_marketplace_loads_for_fleet_owner.sql` | Sanitized open marketplace loads RPC for FO |
| `features/driver/services/fleetOwnerLoads.service.ts` | FO load list helpers |
| `lib/queries/useFleetOwnerOpenLoadsQuery.ts` | React Query for Available Loads |
| `features/driver/components/AvailableLoadsScreen.tsx` | Load discovery list |
| `features/driver/components/AvailableLoadDetailScreen.tsx` | Read-only load detail |
| `app/(driver)/available-loads/*` | Routes |
| `supabase/migrations/20270210143000_fleet_owner_capacity_story.sql` | Phase 3B.1: `VEHICLE_AVAILABILITY` on posts, nullable org, `owner_vehicle_id`, FO RLS + create/deactivate RPCs, organic `get_network_feed` branch |
| `features/driver/services/fleetOwnerCapacityStory.service.ts` | Create / list / deactivate capacity Stories |
| `lib/queries/useMyCapacityStoriesQuery.ts` | FO “My availability” query |
| `features/driver/components/CapacityStoryComposerScreen.tsx` | Minimal capacity Story composer |
| `app/(driver)/capacity-story.tsx` | Route entry |

---

## Modified files

| File | What changed |
|------|----------------|
| `lib/capabilities.ts` | Org model flags; finance/party helpers; asset = no indent create; hybrid merge safe; `hasBusinessCapabilities`; `allowedConnectionRoles` (counterparty-aware client/supplier); `operatingModelTransition` (impact preview); removed hardcoded driver limits |
| `features/organization/services/organization.service.ts` | `changeOperatingModel` RPC wrapper + `looksLikeModelChangeCooldownError` |
| `features/organization/services/members.service.ts` | `transferOwnership` RPC wrapper + `looksLikeTransferTargetError`; `updateMemberRole` → `set_member_role`; new `updateMemberPermissions` for domain toggles + `looksLikeNotOwnerError`; new `updateBulkMemberPermissions` |
| `lib/routes.ts` | `MODALS.ACCESS_CONTROL` + `MODALS.MEMBER_PERMISSIONS`; driver FO routes incl. `driverCapacityStory` (3B.1) |
| `features/reach/screens/DriverStoriesScreen.tsx` | FO “My availability” + Share capacity entry (3B.1); no bidding |
| `app/(modals)/_layout.tsx` | Register `access-control` + `member-permissions` fullScreenModal screens |
| `features/organization/components/workspace/WorkspaceTeamPanel.tsx` | Owner-only "Access" button → `ROUTES.MODALS.ACCESS_CONTROL` |
| `features/network/components/desktop/NetworkDesktopTeamPanel.tsx` | Owner-only "Access" button (network hub Team tab) → `ROUTES.MODALS.ACCESS_CONTROL` |
| `lib/navigationPolicy/registry/org.ts` | `org.modal-access-control` + `org.modal-member-permissions` policies |
| `features/organization/components/TeamMembersView.tsx` | Edit → member-permissions modal (no `MemberEditModal`); phone-invite cancel stays local; multi-select and bulk role assignment action bar |
| `features/organization/utils/teamInviteRoles.util.ts` | `MemberDomainFlags`, `domains` on permissions, domain helpers, `buildPermissionsFromDomains`; added `restricted` fallback role for zero-domain members |
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
| `features/drivers/screens/DriverControlScreen.tsx` | `employerOrgIdSet` excludes `tracking_only` driver rows (open-trip phone stubs are not real employment); `tripIsAggregate` also true when `tripDriver.tracking_only === true`, not just when `trip.supplier_id` is set — fixes fabricated "Estimated earnings" / "Attribute to employer" for Aggregate-mode direct open-trip assignments |

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

---

## Part 5 — wiring the unenforced surfaces

An audit of `MEMBER_SURFACE_CATALOG` (85 surfaces) found 47 enforced via `canSurface(...)`, a further 17 enforced indirectly (finance sub-tabs and ledger filters via `canAccessFinanceSubTab` / `ledgerCategorySurface`; the three primary tabs via `MemberDomainGate`; team/access-control via owner-only `useOrgRole().isOwner` + `set_member_role` RPC), and **21 that were stored, rendered as toggles, and never read**. Turning those off changed nothing — the permission UI made promises it did not keep. This part wires them.

### New files

| File | Purpose |
|------|---------|
| `components/SurfaceAccessGate.tsx` | Reusable whole-screen gate for a single `MemberSurfaceId`. Holds a blank frame while surfaces hydrate (same rule as `ModelAccessGate`), then renders children or a themed no-access notice. Owner/admin bypass comes from `useMemberAccess`. |

### Modified files

| File | Change |
|------|--------|
| `locales/en.json` | New keys `surfaceNoAccessTitle` / `surfaceNoAccessBody` for the gate notice |
| `app/documents-center/index.tsx` | Body wrapped in `SurfaceAccessGate surface="finance.documents_center"` (header left outside so Back stays usable) |
| `app/pod-reconciliation/index.tsx` | Wrapped — `finance.pod_reconciliation` |
| `app/business-pulse.tsx` | Screen body wrapped — `finance.business_pulse` |
| `app/load-board/index.tsx` | Wrapped — `sales.load_board` |
| `app/from-clients/index.tsx` | Bare re-export replaced with a wrapper component — `sales.from_clients` |
| `app/notifications/index.tsx` | Wrapped — `workspace.notifications` |
| `app/trip-ledger/[id].tsx` | Wrapped — `finance.trip_ledger` |
| `app/(modals)/edit-client.tsx` | Wrapped — `sales.clients.edit` |
| `features/clients/components/ClientDetailRoute.tsx` | Wrapped — `sales.clients.detail` (route previously had no gate at all) |
| `app/client/[id]/analytics.tsx` | Wrapped — `sales.clients.analytics` |
| `app/supplier/[id].tsx` | `sales.suppliers.detail` nested inside the existing `ModelAccessGate` |
| `app/supplier/[id]/analytics.tsx` | `sales.suppliers.analytics` nested inside the existing `ModelAccessGate` |
| `features/network/screens/StoryDetailScreen.tsx` | `viewerCanBidCapability` now `allowLoadPosts && canSurface("sales.marketplace.bid")`. Deliberately kept separate from the feed filter so a member without the surface still *sees* load posts — they just cannot bid |
| `features/finance/components/FinanceScreen.tsx` | `initialEntry` gated on `finance.edit_transaction`; `onReportPress` omitted without `finance.reports` |
| `features/finance/screens/LedgerSyncScreen.tsx` | `?entryId` deep-link edit gated on `finance.edit_transaction` (falls back to a blank add form) |
| `features/finance/components/EntityDetailOverlay.tsx` | `handleReportPress` + both toolbar props gated on `finance.reports` |
| `features/clients/…/ClientDetailScreen.tsx`, `features/suppliers/…/SupplierDetailScreen.tsx`, `features/drivers/…/DriverDetailScreen.tsx` | `openClientReport` / `openSupplierReport` / `openDriverReport` early-return without `finance.reports` |
| `features/finance/components/TreasurySummaryCard.tsx`, `TreasuryToolbar.tsx`, `TreasuryDetailLayout.tsx`, `FinanceSummarySection.tsx` | `onReportPress` made optional through the whole prop chain; Report button renders only when supplied |
| `features/trips/components/trip-detail/hooks/useTripDetail.ts` | `openTripAdjustmentModal` early-returns without `finance.void_adjustments` — one chokepoint covering add / income / deduction / supplier-cost entry points. Exposes `canVoidAdjustments`, `canViewTripExpenses`, `canApproveTripExpenses` |
| `features/trips/components/trip-detail/TripDetailScreen.tsx` | Expenses tab now needs `tripops.trips.expenses` **and** `finance.expenses.view` (two domains cover the same tab) |
| `features/trips/operations/hub/TripExpensesScreen.tsx` | `handleApprove` early-returns and `onApprove` is omitted (button hidden) without `finance.expenses.approve` |

### Known gaps after Part 5

- **`finance.manage`** — still not read directly. Write actions are gated by their own narrower surfaces (`add_transaction`, `edit_transaction`, `void_adjustments`, `expenses.approve`) plus the `finance_manage` capability, so the toggle is redundant rather than broken. Consider removing it from the catalog or making it a true parent.
- **`finance.shared_ledger` and `finance.branding`** — left unwired **because they have no live UI entry point**. `setShowSharedLedgerModal(true)` is never called anywhere, and `/branding-settings` is a deprecated redirect to `/workspace`. Gating a modal nothing opens would be dead code; wire them when the entry points return.
- **`fleet.vehicles.edit`** — no `EditVehicleModal` or vehicle-edit trigger exists in the codebase; `VehicleProfileScreen`'s `onEditPress` is an empty stub. Nothing to gate yet.
- **Still no server-side enforcement.** Every surface remains client-only; RLS authorizes on org membership alone. A member can bypass any of the above via a direct API call. Unchanged by this part.
- **Nav gates still fail open while loading** (`surfaceLoading || canSurface(...)` in `app/_layout.tsx` and `app/(tabs)/_layout.tsx`) — a denied nav item flashes briefly before surfaces resolve. Cosmetic; destination screens re-check.

**Verification:** `tsc --noEmit` 28 errors before and after (all pre-existing, none in touched files); `eslint` 0 errors on every edited file; `jest` 759 passed / 6 failed — identical to the clean-tree baseline (same 4 suites). No behavior was tested in a running app.

## How to update this file

When you change RBAC again:

1. Add a row under **New files** or **Modified files**.
2. Update the matrix in `docs/RBAC_OPERATING_MODEL.md` if behavior changed.
3. Note the commit hash in **Session / commits** when landed.
