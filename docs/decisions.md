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
