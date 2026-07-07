# Transport Work — Implementation Roadmap

This is where implementation belongs — not in `01-transport-work-v1.md` (architecture) or `03-transport-work-gap-analysis.md` (assessment). Each phase is independently deployable. No phase has been triggered yet; this document records sequencing, not authorization to build.

## Phase 1 — Shared Planning Engine
No schema changes. No UI redesign. Reuse existing tables (`indents`, `posts`). Consolidate the duplicated Request/Planning capture logic identified in the gap analysis into one shared component/service, without changing which table it writes to yet.

**Success Criteria**
- Indent and Marketplace planning capture use one shared component/service
- No schema changes
- Existing `indents`/`posts` tables continue to work unchanged

## Phase 2 — Shared Allocation Engine
Merge Trip allocation (`allocationWizardSteps.ts`) and Indent allocation (`indentAllocationWizardSteps.ts`) into one engine, reusing the already-shared widgets (`AssignmentEntityPicker`, keypad flows). One allocation-result type instead of three.

**Success Criteria**
- Trip and Indent use the same allocation engine
- One shared allocation state
- No duplicated allocation wizard
- Existing backend APIs unchanged

## Phase 3 — Capacity Engine
Manual, Direct, Marketplace, API, AI become one service with a shared interface, instead of `indents` and `posts` being separate parallel structures.

**Success Criteria**
- Manual, Direct, and Marketplace resolve through one shared interface
- The Request/Planning duplication between `indents` and `posts` (Gap Analysis) is eliminated
- API and AI strategies can be added later without touching Manual/Direct/Marketplace code

## Phase 4 — Transport Work Table
The real aggregate root. `trips.transport_work_id` replaces `indents.trip_id`'s direction, enabling the multi-Trip extensibility rule. This is the largest single piece of schema work in this roadmap and needs its own ADR before starting — it changes RLS, cross-org visibility timing, and when a shipper first sees a record.

**Success Criteria**
- `transport_work` table exists and is the row created at Request time for every capacity strategy
- `trips.transport_work_id` replaces `indents.trip_id` as the relationship direction
- One Transport Work can reference multiple Trips without a further schema change
- RLS reviewed and approved via a dedicated ADR before this phase starts

## Phase 5 — Navigation
Trips, Indents, and Marketplace collapse into one Operations experience.

**Success Criteria**
- Trips, Indents, and Marketplace tabs replaced by one Operations experience
- No loss of existing functionality for any current user role
- Every screen still answers exactly one business question (Principle 7)

## Phase 6 — Automation
AI Dispatch, Auto Tender, Optimization, and similar capabilities build on top of the now-unified lifecycle.

**Success Criteria**
- At least one automation operates purely on Transport Work state, without special-casing capacity strategy
- Automation actions are visible in the Transport Work timeline as events
