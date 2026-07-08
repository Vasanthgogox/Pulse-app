# Pulse Platform — Permissions

**Status:** Seed — NOT frozen. Do not treat this document as settled.

## What's known (grounded)

Two separate permission systems exist today and are **not yet reconciled**:

- **`lib/capabilities.ts`** — UI-level feature gating. `Capability` enum (`fleet_management`, `dispatch`, `dispatch_for_own_fleet`, `marketplace_post`, `marketplace_bid`, `finance_view`, `finance_manage`, `team_manage`) → `getEffectivePermissions()` → boolean/nested flags, derived from profile role + asset/aggregated flags.
- **`lib/platform-identity/types/permissions.ts` + `PLATFORM_ROLE_GRANTS`** — admin-delegation boundaries. `PlatformPermission` enum (`members.invite/remove/view`, `organization.settings/archive`, `identity.policy.edit`, `sso.configure`, `billing.manage`) → role-based grants (admin/planner/operator, plus a hardcoded owner set).
- These don't conflict today (different layers: feature gating vs. admin delegation), but a single Platform `permissions` model needs to decide whether they merge, one wraps the other, or they stay permanently separate with a documented boundary.

## Open question

How does the Product Registry's `activation`/`interfaces` metadata (`08-product-registry.md`) interact with these two existing permission systems when deciding what a Pulse Home shows a given user? Not designed yet.

## What NOT to do until this is resolved

Do not build a third permission system. Do not let the Product Resolver invent its own gating logic — Phase 1 should gate the Pulse Home on activation status only (per the already-agreed Phase 1 scope), explicitly deferring fine-grained permission integration to whenever this document is actually frozen.
