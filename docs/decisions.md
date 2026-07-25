# Architectural Decisions

## Realtime updates
Use Supabase Realtime channels — never poll.
**Reason:** Previous polling caused duplicate messages and unnecessary DB load.

## Query keys
Always use `queryKeys.*` factory from `lib/queryKeys.ts` — never inline arrays.
**Reason:** Inline arrays cause cache inconsistencies; factory ensures key stability across invalidations.

## Realtime invalidation strategy
UPDATE events merge in-place; INSERT/DELETE fully invalidate the list.
**Reason:** GPS pings cause frequent trip UPDATEs — full invalidation on every update caused refetch storms.

## Entity refresh on tab switch
Do not increment `entitiesRefreshKey` on finance tab switch — cache staleTime handles freshness.
**Reason:** Key increment caused `entitiesLoading` flash even when data was cached.

## No service_role key in app
All DB access goes through RLS with the anon key.
**Reason:** Security — service_role bypasses RLS and must never be exposed client-side.

## Platform-specific components
Map and PDF use `.native.tsx` / `.web.tsx` file splits — not runtime Platform.OS checks.
**Reason:** Avoids bundling platform-incompatible native modules into the web bundle.

## Auth storage
SecureStore on native, AsyncStorage on web — selected in `lib/supabase.ts`.
**Reason:** SecureStore is not available on web; AsyncStorage is the correct fallback for Expo Go and web.

## Migrations
Always add new incremental files — never edit existing migrations.
**Reason:** Existing migrations may already be applied in production; editing them causes drift.

## Mobile Identity substrate (ADR-001)
Mobile app Identity (Workspace/Roles/Permissions/Grants, per the Engineering Handbook V5 roadmap) targets the existing `platform.*` schema and its planned Gateway (`oms/docs/ROADMAP.md`, `PLATFORM_PRINCIPLES.md`) as the canonical Identity bounded context — no second, parallel `identity` schema is created for the mobile app.
**Reason:** `oms/docs/PLATFORM_PRINCIPLES.md` already declares Identity a shared, frozen platform bounded context that business domains consume rather than reimplement ("Business domains consume Platform... they do not reimplement platform infrastructure"). Building a separate `identity` schema for mobile would create two competing Identity systems for the same product line.

## Pre-Gateway platform.* access (ADR-002)
Until oms/ Sprint 2 (Gateway) ships, the mobile app may **read** `platform.organizations`/`platform.memberships`/`platform.roles` directly via Supabase (RLS-gated) — the same pre-Gateway state oms/ itself is currently in. Writes remain out of scope for mobile until Gateway exists.
**Reason:** Gateway/Command Store (oms/ Sprints 2–4) have no committed ship date; blocking all mobile Identity work until they land would stall the roadmap indefinitely. Read-only access stays RLS-safe and reversible, and is an explicitly tracked, temporary exception to `PLATFORM_PRINCIPLES.md`'s "UI never writes databases directly" rule — mobile must migrate behind Gateway once Sprint 2 ships.

## Gateway Compatibility Rule (ADR-003)
Only `features/organization/services/platformOrganization.service.ts` may query the `platform` schema (`supabase().schema('platform')`). Every other file — screens, hooks, other features — imports from that service, never the schema directly. Bounded-context folder is `features/organization/` (the business domain), not `features/identity/` (already used for unrelated display-identity/avatar resolution) or `features/platformIdentity/` (named for infrastructure, not a business capability). The service file is named `platformOrganization.service.ts`, not `organization.service.ts`, because that name is already taken by the legacy `public.organizations` service.
**Reason:** Centralizing all `platform.*` access behind one service is what lets the underlying implementation move from direct Supabase reads to Gateway-mediated calls later without touching every call site.

## Clarification to ADR-001 — what actually happened (recorded at PR-008)
ADR-001 anticipated mobile Identity's real business logic eventually running on oms/'s `platform.*` Postgres schema. In practice, a separate, richer domain model (`lib/platform-identity/`, `lib/onboarding/` — `platformIdentityService`, `membershipPolicyEngineV1`, identity providers) was built independently on top of the **existing `public.*` tables** (`organization_team_invites`, `organizations`, `organization_members`), not on `platform.*`. `platformOrganization.service.ts` and `platformIdentityShadowCheck.util.ts` (ADR-001–003) were **not abandoned** — they're the live shadow-mode comparison layer, called from `platformIdentityService.acceptInvitation()` on every real accept, exactly as originally designed. The cutover to `platform.*` as the authoritative store (ADR-001's original mechanism) has not happened and isn't scheduled; ADR-001's underlying intent — never build a second, competing Identity system — still held, it just resolved as "richer domain model over `public.*`, with `platform.*` kept live for comparison" rather than "adopt `platform.*` directly."
**Reason:** Recording this now, precisely, so a future reader doesn't read ADR-001 and assume the mobile app's business logic runs on `platform.*` — it doesn't, and `platformOrganization.service.ts`'s only real caller is the shadow checker.

## PR-008 cutover — confirmed-dead code removed (ADR-004)
Per the Architecture Freeze Review, deleted `lib/onboarding/completeOnboarding.util.ts`, `lib/onboarding/employmentPolicy.ts`, the deprecated `lib/onboarding/membershipPolicyEngine.ts` (and its internal `evaluateMembershipPolicyV1` alias), and the orphaned `resolvePendingInvitationsByPhone()` function — all had zero remaining callers, confirmed by direct search immediately before each deletion. `MembershipPolicyRequiredAction` was relocated from the deleted `membershipPolicyEngine.ts` into `lib/platform-identity/policy/policyDecision.ts`, its only real remaining consumer. `platformIdentityService.acceptInvitation()`/`.switchWorkspace()` and `membershipPolicyEngineV1.evaluateJoinPoliciesV1()` are now the sole implementations for onboarding orchestration and membership policy, respectively — no functional behavior changed, this was deletion of already-unreachable code.
**Reason:** Six of eight reviewed domains (Identity, Invitation Resolution, Employment Policy, Organization Status, Audit, Membership Policy after the type move) already had exactly one authoritative implementation each; the two with leftover deprecated code were fully consolidated by the time this PR ran, not by new migration work.

## Platform Architecture reconciliation (ADR-005)
Two independently-frozen "Architecture v1.0" documents existed simultaneously: `docs/architecture/platform/01-platform-principles.md` (new, business/platform architecture — Platform → Identity/Workspace/Shared Services/Products → Experiences) and `oms/docs/PLATFORM_PRINCIPLES.md` (existing, infrastructure architecture — Gateway/Identity Service/Command Store/Timeline/Observatory). They also defined **"Workspace" as opposite concepts**: the new architecture uses Workspace for the tenant operating boundary (consistent with Slack/Notion/Asana/Linear); the existing OMS document used "Workspace" for what the new architecture calls **Product** (Pulse Commerce, Pulse Finance, Pulse Operations, etc.).

**Decision:**
1. `docs/architecture/platform/01-platform-principles.md` is the canonical, governing "Architecture v1.0" for business/platform vocabulary (Platform, Workspace, Product, Experience, Module, Feature, Entity). `oms/docs/PLATFORM_PRINCIPLES.md` is re-scoped as the **Technical Architecture** layer beneath it (Gateway, Identity Service, Command Store, Timeline, Observatory, SDK) — its own "frozen v1.0" claim now applies only to that technical layer, not to business vocabulary.
2. `oms/docs/PLATFORM_PRINCIPLES.md`'s "Workspaces (customer mental model)" table is renamed "Products (customer mental model)" — Pulse Commerce/Finance/Operations/Execution/Network/Intelligence/Admin are Products, not Workspaces.
3. Existing platform infrastructure (`packages/contracts`, the `platform.*` Postgres schema and its migrations `202611060001`–`005`, the Sprint 1–5 roadmap in `oms/docs/ROADMAP.md`) is **reused and extended, not replaced** — see `docs/architecture/platform/00-platform-reconciliation.md` for the full asset-by-asset disposition. Shared Services (`docs/architecture/platform/11-shared-services.md`) sit parallel to Products under Platform, not beneath them — products consume Shared Services, they don't own or sit above them.
**Reason:** Business vocabulary must be stable regardless of implementation progress or which team/document arrived first. The Workspace/Workspace collision was a language conflict, not a technical one, and left unresolved it would cause architecture drift as more engineers read one document or the other. Keeping the new definition (Workspace = tenant boundary) matches established SaaS platform convention; renaming the OMS side was lower-cost than renaming a concept already consistent with industry norms.

## Shared platform master data — Core and Commerce (ADR-006)
Core and Commerce are **two applications over the same Pulse Platform**, not two apps that sync copies of each other's data. Master data is **owned by the workspace** and accessed through **platform services** — products never own duplicate tables or localStorage copies.

**Principle:** Workspace owns business data. Platform services own data access. Products own workflows.

**Layering:**
```
Core UI / Commerce UI
        │
 CustomerService (WarehouseService, ProductService)
        │
   customerRepository
        │
      clients
```
Core keeps `features/clients/services/clients.service.ts` as a **compatibility adapter** that delegates CRUD to `CustomerService` — minimize UI churn; remove adapter when imports migrate.

**Ownership:**

| Layer | Owns |
|-------|------|
| **Platform** | Customers (`clients`), Warehouses (`client_warehouses`), **Products** (`products` — shared catalog), Contacts, Addresses |
| **Commerce** | Sales orders, quotes, invoices, inventory (`commerce_inventory`), pricing, fulfillment workflow |
| **Core** | Trips, drivers, vehicles, indents, tracking, load board |

Products are **platform-owned catalog**, not Commerce-owned — reusable across Warehouse, CRM, Procurement, Analytics, and Core cargo references. Cross-product links use IDs only (`order_id`, `indent_id`, `trip_id`).

**Platform layer:** `lib/platform/{db,repositories,services,events,orchestration,types}/` — Core and Commerce configure via `configurePlatformDb()`. Services perform single-domain CRUD; orchestration (Phase 3) coordinates cross-product workflows (`publishIndent`, domain events).

**Commerce workflow data** (sales_orders, commerce_inventory, execution_plans) remains Commerce-scoped until event pipeline links orders → indents.

**Reason:** Every Commerce-local master data entity increases migration cost and causes Core/Commerce drift. Platform services allow future Gateway/cache swaps without touching product UIs.

## Platform master-data deletion semantics (ADR-007, backlog)

**Current state (acceptable for Phase 2–3):**

| Entity | Delete mechanism | Active filter |
|--------|------------------|---------------|
| Customer (`clients`) | `status = 'inactive'` | `status = 'active'` |
| Warehouse (`client_warehouses`) | `deleted_at` | `deleted_at IS NULL` |
| Product (`products`) | `deleted_at` + `status = 'archived'` | `deleted_at IS NULL` |

**Decision:** Deletion semantics may diverge short-term. Platform deletion should **converge over time** — whether the eventual model is `deleted_at`, `status`, or status + lifecycle timestamps is TBD. This does **not** block orchestration (Phase 3).

**Backlog:** Unify soft-delete representation across `CustomerService`, `WarehouseService`, and `ProductService` when schema migration is scheduled.

## Trip Room vs. legacy chat messaging model (ADR-008, pending product decision)

**Status:** Not decided. Full options analysis, dependency map, and trade-offs in `docs/ADR-008-trip-room-messaging-model.md`. Engineering work on the `trip_messages`/`chat_messages` dual-write (`docs/REALTIME_MESSAGING_ARCHITECTURE_REVIEW.md`) is frozen until this is answered.

**The question:** is Trip Room (`chatPlatform.service.ts`, `chat_messages`/`chat_conversations`) intended to replace legacy per-lane Driver/User/Dispatcher chat (`chat.service.ts`, `trip_messages`/`trip_conversations`), observe it permanently, or is neither schema the right long-term canonical model? The mirror trigger bridging the two tables is either temporary migration scaffolding or permanent, load-bearing sync infrastructure depending on the answer — this is a product-intent question, not something resolvable from code.

## Reach is a platform capability, not a Stories feature (ADR-009)

**Decision:** Pulse Reach (`features/reach/`, `reach_campaigns`/`reach_events`/`reach_plans`/`pulse_credit_*` tables) is a reusable promotion/growth capability. Stories (`posts`, `features/network/`) are its first *consumer*, not its owner. `reach_campaigns.post_id` was deliberately built as a generic FK to `public.posts` rather than a Story-specific table, so any future promotable object — marketplace listings, vehicle/driver listings, business profiles — can become a second consumer without duplicating campaign/payment/lifecycle/analytics logic, as long as it can be represented as (or bridged to) a `posts` row or a future generalization of that FK.

**Reason:** Reach was built inside the Network/Stories surface for delivery speed (Phase 0–2.1), but its actual shape — plans, credits, campaign lifecycle, upgrade, analytics — has no dependency on Stories-specific concepts. Keeping it structurally separate (`features/reach/` already does this) avoids the common failure mode where a feature quietly calcifies around its first UI host and becomes expensive to re-platform later.

**Not decided here:** how Reach's home fits into this repo's existing frozen platform vocabulary (`docs/architecture/platform/01-platform-principles.md` — Platform/Workspace/Product/Experience/Module/Feature/Entity). A separate "Growth" *domain* was proposed in conversation (alongside Identity/Network/Operations/Commerce/Intelligence) — that's a taxonomy decision for whoever owns the platform docs to reconcile with the frozen model, not something this ADR resolves unilaterally.

**Backlog (Growth Platform, not started) — the Growth admin module is exactly these seven children, nothing more:** Credits, Reach Plans, Reward Rules, Invitation Rules, Promotions, Ledger, Analytics — as one module, not split into separate admin products. Plus: customer-facing Reach home (Overview/Campaigns/Earn Credits) as its own nav destination; the Platform Events → Growth Rules → Credits Ledger → Wallet → Notifications pipeline; Growth Experiments (no-code configurable reward campaigns) — deliberately sequenced *before* AI/Control Tower work, per product direction.

**Manual credit adjustments are a bootstrap mechanism, not the end-state.** Today every credit comes from ADMIN (the `analytics/` Credits panel). That's expected to *decrease* over time as SYSTEM-origin rules (verification, invitation, promotion) come online in Phase 2.4 — manual grants become the exception, not the normal workflow.

**Product rule, not implemented — Credit Issuance Hierarchy.** Every `pulse_credit_transactions` row should eventually trace to exactly one of three origins:

- **SYSTEM** — Verification, Invitation, Promotion (automated, once the Growth Engine pipeline exists)
- **ADMIN** — Adjustment, Support, Compensation (today's `analytics/` Credits panel)
- **TRANSACTIONAL** — Purchase, Refund, Campaign Spend (`spend_reach` already fits here; named "transactional" rather than "user" because campaign spend is a business-operations movement, not a thing a user *earns* — this framing also scales better if subscriptions, cashback, or partner-funded credits show up later)

This is currently *derived* in the Credits panel UI from the existing `type` column (see `SOURCE_BY_TYPE` in `analytics/src/components/credits/CreditsPanel.tsx`) rather than stored as its own column — deliberately, to avoid two overlapping fields drifting out of sync. If/when the type vocabulary grows enough that a clean 1:1 mapping onto these three origins stops holding, promoting `source` to a real stored (and ideally generated/computed) column is the natural next step — not before.

**Future ADR (not now, no commercial need yet) — Credit Lifecycle.** Do promotional credits expire? Purchased credits? Refunded credits? These are business rules, not implementation details — deferred until there's a real commercial reason to answer them, but tracked here so the question isn't lost.

**Naming direction, not implemented — "Credit Adjustment" over "Grant/Deduct Credits."** The Credits panel's underlying operation is broader than its two current buttons suggest: Grant, Deduct, Correction, Refund, and Reversal are all the same shape (an admin-initiated ledger entry with a reason). The UI can keep exposing Grant/Deduct as the two buttons that cover 95% of real usage, but if a third action (e.g. Correction) is ever added, model it as another instance of the same "Credit Adjustment" concept rather than a bespoke new flow.

