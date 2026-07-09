# Relationship Guard v1 — Bid → Award

Layer 3 domain document. Independent track from `06`-`10` (Commerce/Core/Execution) — this is Network/Bidding, and does not block on or get blocked by the `ExecutionOrchestrator` acceptance gate.

**The one business question this document answers:** how does an unknown external workspace become eligible to receive work?

**Scope, explicitly:** Bid → Award only. Not a universal external-entry shield. RFQs, invoice sharing, warehouse invitations, driver/vendor onboarding are out of scope — see Future Evolution.

## Current State (grounded)

This is not a greenfield problem — most of the infrastructure already exists, just not wired together for this purpose:

- `public.organization_relations` (`20250307120000_connection_requests.sql`) — an **established, accepted** connection between two orgs. `relation_type: 'client_supplier' | 'supplier_client' | 'broker_fleet'`, `status: 'pending' | 'active' | 'suspended' | 'ended'`. This is the real table behind "Workspace Connection Created" in the flow below — it already exists.
- `public.connection_requests` (same migration) — the **request/approval** workflow: `from_organization_id`, `to_organization_id`, `status`, `request_shipper_client`/`request_carrier_supplier` flags. `features/connections/services/connectionRequests.service.ts` wraps it: `createConnectionRequest()`, `approveConnectionRequest()`, `getLatestConnectionRequestStatus()`, `getConnectionRequestsSent/Received()`. Approving a request has a DB trigger that creates the `organization_relations` row.
- **The verified gap:** `features/network/services/bids.service.ts`'s `BidStatus` is `'pending' | 'accepted' | 'rejected' | 'withdrawn'`. `acceptBid()` is `.update({ status: 'accepted' }).eq('status', 'pending')` — no relationship check anywhere in the path. A bid can be accepted regardless of whether `organization_relations` has any row between the two orgs.

**Consequence for this design:** `RelationshipService` v1 is not a new system — it's a thin, purpose-built adapter over `connectionRequests.service.ts` and `organization_relations`, plus one genuinely new piece: a `canAward()` guard wired into `acceptBid()`/award that doesn't exist today. Building a parallel connection-request system instead of reusing this one would repeat this session's `productRepository`/`products`-table mistake at a larger scale.

## v1 Flow

```
Public Load Link
        │
        ▼
View Load
        │
        ▼
Sign Up / Login
        │
        ▼
Workspace Identified
        │
        ▼
Submit Bid
        │
        ▼
Bid = Pending Relationship
        │
        ▼
Shipper Reviews Bidder
        │
        ├── Reject Relationship
        │
        └── Accept Relationship
                 │
                 ▼
Workspace Connection Created  ← organization_relations row (already real)
                 │
                 ▼
Bid Eligible For Award
                 │
                 ▼
Award Trip
```

## Bid Lifecycle (v1 — deliberately small)

```
Pending
   │
   ▼
RelationshipPending
   │
   ▼
EligibleForAward
   │
   ├──▶ Awarded
   ├──▶ Rejected
   └──▶ Withdrawn
```

Adds exactly one new state (`RelationshipPending`) and one new terminal-adjacent state (`EligibleForAward`) to the existing four. Not a rewrite of `BidStatus` — an insertion between `pending` and `accepted`.

## RelationshipService v1 — minimal surface

```typescript
RelationshipService.requestConnection(fromOrgId, toOrgId, options)   // → createConnectionRequest()
RelationshipService.acceptConnection(requestId)                      // → approveConnectionRequest()
RelationshipService.rejectConnection(requestId)                      // → existing reject path
RelationshipService.getRelationshipStatus(orgA, orgB)                // → query organization_relations
RelationshipService.canAward(bidderOrgId, shipperOrgId): boolean     // NEW — the only genuinely new logic
```

**Explicitly not included in v1** — do not build until a second real workflow needs them: partner scoring, KYC workflows, warehouse invitations, invoice sharing, payment permissions. Each of these would be its own future consumer of `canAward`-style checks, not a reason to widen this interface now.

## Award Guard — the single enforcement point

```
AwardBid
   │
   ▼
RelationshipService.canAward(bidderOrgId, shipperOrgId)
   │
   ├── false → "Relationship Required" (surface: invite partner / accept connection)
   │
   └── true → Award
```

This check belongs in the backend command handler, not the UI — a bypassed or scripted call to whatever `acceptBid`/award endpoint exists must still refuse the award if `canAward()` is false. `canAward()` itself is a query against `organization_relations` for an `active` row between the two orgs (exact `relation_type` matching TBD at implementation — likely `client_supplier` or `supplier_client` depending on bid direction).

## Commands and Events (only what has an immediate consumer)

**Commands:** `RequestWorkspaceConnection`, `AcceptWorkspaceConnection`, `AwardBid` — the first two are largely renames of what `connectionRequests.service.ts` already does; `AwardBid` is new (currently just `acceptBid()` with no guard).

**Events:** `WorkspaceConnectionRequested`, `WorkspaceConnectionAccepted`, `BidEligibleForAward`, `BidAwarded` — following `10-platform-event-catalog.md`'s discipline exactly: these get added to that catalog as 🟡 Planned only once a publish call site exists, not before. No dozens of reserved events speculatively added here.

`BidEligibleForAward` is the useful intermediate event this design adds: it separates "someone placed a bid" from "this bidder is now eligible to receive work" — the same kind of precise, business-outcome naming already established for `OrderReadyForDispatch`/`TripDelivered`.

## Future Evolution

If additional external-entry workflows (RFQs, invoice sharing, warehouse invitations, driver onboarding, vendor onboarding, etc.) require the same trust model, `RelationshipService` may become the common platform trust layer described in the original proposal. Those flows are intentionally out of scope for v1 and should only be added once they become concrete consumers — not designed against speculatively now.

## Relationship to other tracks

Independent of `06`-`10`. Does not block, and is not blocked by, the `ExecutionOrchestrator` live acceptance record (`08-phase2-verification.md`, `lib/platform/orchestration/ACCEPTANCE_RECORD.md`) — that remains the release-validation priority; this is a separate feature/architecture milestone that can proceed in parallel.
