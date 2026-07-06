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
