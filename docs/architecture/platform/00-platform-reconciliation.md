# Pulse Platform — Reconciliation

**Status:** Transitional. Decisions 1 and 2 below are now ratified as **ADR-005** (`docs/decisions.md`) — this document's Existing Assets Inventory and Reconciliation Matrix remain the detailed backing reference, but the decisions themselves live in the ADR. Once implementation catches up with the reconciled architecture, this document should be archived; ADR-005 is the permanent record.
**Purpose:** Map every existing platform artifact (`oms/docs/*`, `packages/contracts`, `packages/pulse-sdk`) against the newly-frozen Platform Architecture (`01-platform-principles.md`... `11-shared-services.md`).

## Three Layers

| Layer | Answers | Documents |
|---|---|---|
| **1 — Platform Architecture** (governing) | How should Pulse behave? | `01-platform-principles.md` ... `11-shared-services.md` |
| **2 — Platform Infrastructure** (implementation) | How do we implement it? | `oms/docs/ROADMAP.md`, `PLATFORM_CANONICAL_MODEL.md`, `PLATFORM_ENTITY_MODEL.md`, `PLATFORM_PRINCIPLES.md`, `REPOSITORY_LAYOUT.md`, `packages/contracts`, `packages/pulse-sdk` |
| **3 — Domain Architecture** | How does each business capability work? | `docs/architecture/01-transport-work-v1.md` ... `05-transport-work-decisions.md` (Transport Work is the first of these; Commerce/Finance/Warehouse/CRM would each get their own) |

Layer 1 governs. Layer 2 is reconciled underneath it — reused, extended, renamed, or retired, not treated as a competing architecture. Layer 3 operates inside products, on Workspace-owned entities, under Layer 1's rules.

## Existing Assets Inventory

| Asset | Status | Disposition | Reason |
|---|---|---|---|
| `packages/contracts` (`@pulse/contracts`) | Real, git-committed, frozen v1 envelopes; **already imported live** by `features/organization/utils/teamInviteRoles.util.ts` | **Keep, extend** | Command/Event envelope contracts and Identity DTOs are genuinely reusable — they're a real implementation of what `08-product-registry.md`'s `creates`/`reads`/`writes` declares only as documentation |
| `packages/pulse-sdk` | README-only stub, explicitly "Phase 5, do not build now" | **Keep as-is** | Not yet relevant to Phase 1a; correctly deferred by its own document |
| `packages/shared-types` | Placeholder re-exporting `../../../types`, marked "future monorepo use" | **Keep, low priority** | Predates this reconciliation; folds into whichever registry package structure gets decided |
| `oms/docs/ROADMAP.md` | Real, detailed. Sprint 1 (Identity) is now confirmed **substantially built** — see `@pulse/platform-identity` below, not just "marked Implement" | **Keep, reframe** | Sprint sequence (Identity → Gateway → Command Store → Timeline → Observatory) is sound engineering sequencing; needs reframing as Layer 2 *under* Layer 1, not a parallel v1.0 |
| `oms/docs/PLATFORM_CANONICAL_MODEL.md` | Real — bounded contexts, entity list, ID formats, lifecycles, event catalog | **Keep, merge terminology** | Its Sales Order / Execution Plan lifecycles are close cousins of Transport Work's own lifecycle (Layer 3) — likely the same underlying business reality, described independently |
| `oms/docs/PLATFORM_ENTITY_MODEL.md` | Real — physical `platform.*` Postgres schema, 5 real migrations already in `supabase/migrations/` | **Keep, treat as implementation of Workspace/Identity** | This is the physical layer our abstract `03-workspace.md` never specified — see Reconciliation Matrix |
| `oms/docs/PLATFORM_PRINCIPLES.md` | Real, self-declares "Architecture v1.0 — Frozen" | **Supersede status only, keep content** | Cannot remain independently "frozen v1.0" alongside our own — see Open Decision 1. Its 14 Core Principles substantially restate our Laws with a real mechanism attached |
| `oms/docs/REPOSITORY_LAYOUT.md` | Real, reserves `packages/platform/` as a **namespace/container**, not a package itself — sibling packages `@pulse/platform-identity`, `@pulse/platform-runtime`, `@pulse/platform-observability` live underneath it | **Keep, honor the convention** | `packages/platform/` has no package.json of its own; each subfolder is its own independently-named package. Any new work follows this same sibling-package pattern, never a top-level `@pulse/platform` aggregator |
| `packages/platform/identity/` (`@pulse/platform-identity`) | **Real and substantially complete** — routes, JWT, middleware, repositories, validation, its own `package-lock.json`, and a full test suite including `SPRINT1_EXIT_CHECKLIST.md` and `sprint1-exit.test.ts` | **Keep** | This is Sprint 1, and it looks built, not merely planned — updates the "staffing unconfirmed" characterization below |
| `packages/platform/observability/` (`@pulse/platform-observability`) | Real — logger, metrics, Hono middleware, request context | **Keep** | Already consumed by `@pulse/platform-identity`'s own `src/index.ts` |
| `packages/platform/runtime/` (`@pulse/platform-runtime`) | Real — `platform-runtime.ts`, the literal `PlatformRuntime.executeCommand()` referenced throughout `oms/docs/*` | **Keep** | Core to Sprint 2+ (Gateway/Command Store), not yet wired to anything outside its own package |
| `packages/platform/testing/` (`@pulse/platform-testing`) | Real — fixtures, contract validation, permission matrix, JWT helpers | **Keep** | Test support for the above |
| `supabase/migrations/202611060001–005` (identity_core, identity_invitations, identity_rls, identity_seed, identity_rpc_public) | Real files, `CREATE SCHEMA platform` confirmed present | **Keep** | Real schema work; whether it's been pushed to a live database is a separate, narrower question from whether the files are legitimate |
| `features/organization/utils/teamInviteRoles.util.ts` | Live, in the main app, already references `@pulse/contracts` and `platform.roles` | **Keep** | Already-working bridge between the main app's permission system and this infrastructure — evidence the reconciliation is already partially happening in practice, just undocumented |

## Vocabulary Mapping — including one direct collision

| Our term (Layer 1) | Existing term (Layer 2) | Relationship |
|---|---|---|
| Workspace | `platform.organizations` (physically), **but see collision below** | Needs resolution, not a clean 1:1 |
| Product | "Business domain" (Commerce, Planning, Execution, Finance, Network, Intelligence) | Same concept, different name |
| Product communicating via Workspace entities (Law #3) | Commands flow through Gateway; events via Domain Events | Same principle, Layer 2 has the actual mechanism, Layer 1 only states the rule |
| Product Registry (`creates`/`reads`/`writes`/`owns`) | Bounded-context ownership table + Event Catalog (`PLATFORM_CANONICAL_MODEL.md`) | Same idea; Layer 2's version is a real, enforced event system, ours is declarative metadata |
| Shared Services (`11-shared-services.md`) | "Pulse Platform" bounded context (Gateway, Identity, Reference Data, Configuration, Command Store, Timeline, Observatory, Search, Notifications, Feature Flags) | Same concept, more fully specified in Layer 2 |
| Experience | Not modeled in Layer 2 at all | Genuinely new — Layer 2 has no equivalent |
| **⚠️ Workspace (our term)** | **⚠️ "Workspace" (their term) = Commerce, Operations, Execution, Finance, Network, Intelligence, Admin** | **Direct collision, not just a gap.** `PLATFORM_PRINCIPLES.md`'s "Workspaces (customer mental model)" table uses "Workspace" for what we call **Product**. Our "Workspace" (the tenant boundary) is closer to their **Organization**. This is the single most important thing to resolve before writing any more code that uses the word "Workspace" — two documents in this repo currently define it as opposites. |

## Reconciliation Matrix

**Business architecture concepts do not need to map one-to-one onto implementation packages, and shouldn't be expected to.** A single Layer 1 concept may be backed by multiple Layer 2 packages, and that split may change over time without the business architecture changing at all:

- **Workspace** may eventually be backed by *both* `@pulse/platform-identity` (tenant/org/membership data) *and* `@pulse/platform-workspace` (the resolved session/context shape) — two packages, one business concept.
- **Shared Services** may eventually split into `@pulse/platform-notifications`, `@pulse/platform-search`, `@pulse/platform-files`, `@pulse/platform-ai`, etc. rather than staying one `@pulse/platform-shared-services` package. The Law #7 boundary (products consume, don't implement) holds regardless of how many packages end up on the other side of it.

| New Architecture (Layer 1) | Existing Implementation (Layer 2) | Action |
|---|---|---|
| Workspace (tenant boundary) | `platform.organizations` (+ `tenants`, `business_units`, `warehouses`) via `@pulse/platform-identity`; session/context shape via `@pulse/platform-workspace` | **Reuse + extend** — once the naming collision above is resolved |
| Identity | `@pulse/platform-identity` (Sprint 1, substantially built), `platform.users`/`memberships`/`roles` | **Reuse** |
| Product Registry | `packages/contracts` + `PLATFORM_CANONICAL_MODEL.md`'s bounded-context table; new `@pulse/platform-products` package reserved | **Extend** — add our `owns`/`interfaces`/`activation` fields to their existing per-context ownership model rather than building a parallel registry |
| Shared Services | Gateway, Command Store, Timeline, Observatory, Reference Data, Configuration (Sprints 2–5, reserved not built); `@pulse/platform-observability` (real, built); new `@pulse/platform-shared-services` package reserved, may later split per-capability | **Reuse** — these are Shared Services under our Law #7, just already named and partially built |
| Events (`09-events.md`, seed) | Domain Events + Event Catalog + Event Envelope contract (`@pulse/contracts`) | **Reuse, un-seed** — `09-events.md` can graduate from seed to frozen once it adopts this existing, real event catalog instead of inventing one |
| Permissions (`06-permissions.md`, seed) | `platform.roles` + `PLATFORM_ROLE_GRANTS` (already bridged in `teamInviteRoles.util.ts`) | **Merge** — this is the clearest case of "already happening in practice, needs documenting" |
| Navigation (`07-navigation.md`, seed) | Not modeled in Layer 2 | **Design fresh** — no existing asset to reconcile against |
| Extension Model (`10-extension-model.md`, seed) | Not modeled in Layer 2 | **Design fresh** |

## Decisions

1. ~~The Workspace/Workspace naming collision.~~ **Resolved — ADR-005.** Our "Workspace" (tenant boundary) is kept; `PLATFORM_PRINCIPLES.md`'s "Workspaces (customer mental model)" table is renamed "Products (customer mental model)."
2. ~~Which document is authoritative for "Architecture v1.0 — Frozen"?~~ **Resolved — ADR-005.** `01-platform-principles.md` is canonical for business/platform vocabulary. `PLATFORM_PRINCIPLES.md` is re-scoped as the Technical Architecture layer beneath it; its own "frozen v1.0" now applies only there.

3. ~~Is `oms/`'s Sprint 1 (Identity Service) staffed/active right now?~~ **Not a blocker.** The namespace belongs to the architecture, not to whoever is currently implementing it — reclaiming `packages/platform/` doesn't need to wait on staffing status.
4. ~~Physical mapping of Workspace → `platform.organizations` vs. `public.organizations`.~~ **Out of scope for Platform Architecture.** Whether Workspace is physically backed by `public.organizations`, `platform.organizations`, both during migration, or something else is a technical implementation decision — the architecture is intentionally silent on it. Belongs in a technical ADR when OMS's Identity Service work actually proceeds, not here.

## Namespace Reclaimed, Then Corrected

`packages/platform/` is a **namespace/container directory, not a package itself** — there is no top-level `@pulse/platform`. Each subfolder is an independently-named sibling package, matching the convention already established by the real Sprint 1 work:

```
packages/platform/
  identity/           @pulse/platform-identity          (real, substantially built — Sprint 1)
  observability/      @pulse/platform-observability      (real, built)
  runtime/            @pulse/platform-runtime            (real, built)
  testing/            @pulse/platform-testing            (real, built)
  gateway/            (README only — Sprint 2, not built)
  command-store/      (README only — Sprint 3, not built)
  timeline/           (README only — Sprint 4, not built)
  observatory/        (README only — Sprint 5, not built)
  workspace/          @pulse/platform-workspace           (new — governing Platform Architecture, seed)
  products/           @pulse/platform-products            (new — governing Platform Architecture, seed)
  shared-services/    @pulse/platform-shared-services     (new — governing Platform Architecture, seed)
```

Initial namespace reconciliation completed after reviewing existing platform packages. Existing implementation packages remain authoritative; new packages follow the established sibling-package convention.

**Validation completed:** root `workspaces` is `["packages/*", "packages/platform/*"]` (targeted, not a blind recursive glob) — npm correctly discovers all seven real/new sibling packages and correctly skips the four README-only Sprint 2–5 folders (no package.json, no error). The RN app consumes `@pulse/platform-workspace` via normal workspace linking; Metro resolves it and `expo export --platform web` succeeds.

## Decision: OMS stays out of the root npm workspace

**OMS does not join the root npm workspace, and should not be added to it later without re-litigating this decision.** This is deliberate, not an oversight — a future engineer looking at `oms/package.json` may notice `@pulse/platform-workspace` is the only cross-package dependency declared via `file:` instead of ordinary workspace resolution, and be tempted to "clean it up" by adding `oms` to the root `workspaces` array. Doing so **will reintroduce a real build failure**, not just a style inconsistency:

- When `oms` joined the root workspace, npm hoisted `radix-ui` (an OMS-only dependency) up to the root `node_modules`.
- From there, TypeScript's `moduleResolution: "bundler"` resolved `radix-ui`'s internal types against the **root's** `@types/react` (`~19.1.0`) instead of OMS's own declared `^19.2.7`.
- This produced TS2322 "two different types with this name exist" errors on Ref types across `badge.tsx`, `button.tsx`, `scroll-area.tsx`, `select.tsx` — a real compile break, reproduced and confirmed by removing/re-adding workspace membership.
- npm has no per-package `nohoist` (unlike Yarn), so there is no workspace-membership configuration that avoids this while still hoisting.

Instead, OMS depends on `@pulse/platform-workspace` via `"file:../packages/platform/workspace"` in `oms/package.json` — a local symlink to the package without folding OMS's own dependency tree into the root's. This preserves OMS's independent install (its own nested `radix-ui`, its own `@types/react@19.2.17`) while still resolving the shared package. `npm run build` (`tsc -b && vite build`) succeeds under this arrangement.

If OMS ever needs to join the root workspace for some other reason, the `radix-ui`/`@types/react` conflict must be solved first (e.g. pinning a single shared `@types/react` version across both apps) — not assumed away.

**Next:** extract Identity → Workspace → Product Registry one at a time, each independently reversible, each its own commit. Only after those are stable does the rest of OMS's technical roadmap (Gateway, Command Store, Timeline, Observatory) get built out inside this same hierarchy.
