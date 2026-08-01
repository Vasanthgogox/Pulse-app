# ADR-012 — Commerce-Earned Relationship Lifecycle

**Status: Proposed — awaiting product/architecture agreement on Phases 1–4.**  
**Phase 0 (Reach Stability Sprint) is complete.** Marketplace engineering continues under `docs/MARKETPLACE_DOMAIN.md` as **Platform Milestones**. Do not implement Execution Partner / Verified Partner writes until **M4 Commerce Network** (after M1 Resolver and M3 Intelligence).

**Parent domain map:** `docs/MARKETPLACE_DOMAIN.md` — commercial lifecycle, `CommercialOpportunity`, milestones. This ADR owns **relationship progression after commerce**, not the commercial lifecycle itself.

**Supersedes (Bid → Award path only):** `docs/architecture/11-relationship-guard-v1.md`. That document formalized a social-network model: *know someone → then work together*. This ADR inverts that for logistics marketplace awarding.

**Does not replace:** invitation / connection-request flows for organic networking (Grow, invites, mutual introductions). Those remain a parallel path into the network. This ADR owns the path that starts from Reach / marketplace bidding.

## Sequencing (updated)

```
✓ M0  Stabilization              (quoted gone; lifetime + snapshot rules; Get Load fixed)
➡ M1  Commercial Resolver        ← NEXT
  M2  Marketplace Experience
  M3  Commerce Intelligence
  M4  Commerce Network           ← this ADR (Consent → Execution → Verified → Strength)
  M5  Financial Platform
```

Do **not** implement Execution Partner or Verified Business Partner until M0 stays green and M1 is the active engineering focus (M4 comes after Intelligence).

## Phase 0 — Reach Stability Sprint (highest priority)

**Goal:** Make the marketplace reliable under concurrent bids. No new product features beyond visibility lifecycle labels.

### 0.1 Bid pipeline hardening

Investigate / optimize:

- `submit_pulse_bid_with_direct_quote` — append/upsert only; must **not** rewrite indent lifecycle
- `set_indent_quoted_on_direct_quote` — **must be absent** (see incident below)
- `useSubmitBidMutation` / BidSheet cache invalidation — narrow keys only
- Realtime fan-out, story refresh, feed refresh

**Acceptance:** 100 concurrent bids succeed; no pool exhaustion; no deadlocks; no UI freeze; stable realtime.

**Incident (2026-08-01):** `trg_direct_quotes_set_indent_quoted` + `set_indent_quoted_on_direct_quote()` were still live on the linked remote even though history showed the fix as applied — the file had been written at a version already claimed by `pulse-unified-base`, so `db push` skipped it. Concurrent bids all UPDATE the same `indents` row to `quoted`, which is the primary contention + “first bid hides load” failure mode. The same shared-project drift renamed `market_indents_for_org(org_id)` → `(p_org_id)` and took Get Load to zero. Migrations: `20270128103000_market_indents_for_org_pin_p_org_id.sql`, `20270128103100_indent_open_status_not_hidden_by_first_bid.sql`. **Requires `supabase db push --linked`.** See `docs/REACH_STABILITY_SPRINT.md`.

### 0.2 Marketplace lifecycle (product labels)

```
Published → Receiving Bids → Evaluating → Awarded → Executing → Completed
```

Rules:

- First bid never hides the load or the story
- Target price remains visible
- Bid CTA remains until Awarded
- Story evolves (bid counts), does not disappear

UI surfaces must not say **Quoted**. Use **Open Market / Receiving Bids / Awarded** (Evaluating optional later). Internal filter ids may remain `OPEN|QUOTED|…` for compatibility. DB may keep `status='quoted'` as a **deprecated** value (legacy rows / enum); no new writes after migration `20270128103100`. Product filters treat Receiving Bids / My Bids via bid presence, not via that status.

### 0.3 Story evolution (P1 within Phase 0)

Owner/story cards show Open Market, bid counts by source, best bid, last bid age — without closing the market. Deferred UI polish if not shipped with 0.1–0.2; must not block trigger drop.

### Explicitly out of Phase 0

- Business Relationship Consent checkbox
- Execution Partner / Verified Business Partner writes
- Relationship Strength / Trust Platform

## Why this exists

Relationship Guard v1 would have required an `organization_relations` row (or an accepted connection request) **before** a shipper could award a bid. That borrows the social-network pattern:

```
Know someone
        │
        ▼
Work together
```

For logistics, the natural model is the reverse:

```
Work together
        │
        ▼
Know someone
```

A verified business partner on Pulse should be someone you have **successfully executed work with**, not someone who accepted a friend-style invite. That makes the Network hard to game and valuable over time: every verified edge is backed by operational history.

This decision touches Reach, Network, Awarding, Assist, Credit, Insurance, Analytics, and future AI supplier recommendations. Agreeing lifecycle and terminology first is cheaper than evolving the Relationship Guard guardrails in code.

## The single question this ADR answers

**How does an unknown external workspace become a Verified Business Partner?**

Answer: through completed commerce — not through a pre-award connection.

## Decision

### 1. Relationship is a lifecycle, not a binary

```
NO RELATIONSHIP
        │
        ▼
Reach Published
        │
        ▼
Marketplace Bid Submitted
(Business Relationship Consent)
        │
        ▼
Execution Partner
(Awarded)
        │
        ▼
Trip Active
        │
        ▼
Trip Completed
        │
        ▼
Verified Business Partner
        │
        ▼
Relationship Score / history grows forever
```

The network is **not** Connected / Not Connected. It **evolves**.

### 2. Terminology — no social language on commerce surfaces

| Avoid | Use |
|-------|-----|
| Connect | Award Supplier |
| Connect if awarded | Business Relationship Consent |
| Friend / network invite copy on award | Execution / relationship copy |
| Connected (as the only badge) | Relationship state + strength |

**Business Relationship Consent** means: *"If you choose me, we can conduct business together."* It is **not** agreeing to become a friend.

### 3. Explicit relationship states (do not jump to `active`)

Do **not** create `organization_relations.status = 'active'` at trip completion as the first write.

Introduce (conceptually — concrete column vs new table deferred until Phase 2 design):

```
NONE
        │
        ▼
EXECUTION_PARTNER     ← created on Award (after Bid Consent)
        │
        ▼
VERIFIED_PARTNER      ← promoted only on successful trip completion
```

Today `organization_relations` is a **generic** accepted connection. After this change, commerce-earned edges represent a relationship **earned through execution**. That distinction deserves its own lifecycle instead of collapsing into social `active`.

Reversibility until Verified:

- Cancelled / fraud / dispute / no-show → **no** Verified Business Partner
- Execution Partner may end or suspend without promoting

### 4. Award screen copy (product contract)

Shipper must **not** see Connect.

```
Award Supplier

────────────────

This supplier has already agreed to
establish a business relationship
if awarded.

By awarding this shipment you agree
to begin execution with this supplier.

[Award]
```

No social language.

### 5. Bid drawer — source and relationship are visible

Example shape:

| Supplier | Source | Relationship | Status |
|----------|--------|--------------|--------|
| MK Logistics | Network | Verified | Bid |
| Fast Cargo | Marketplace | New | Bid |
| Express Movers | Marketplace | Execution Partner | Awarded |

Source tags (Network vs Marketplace / Reach) are first-class UI, not optional polish.

### 6. Marketplace / Reach stays open until Award

**Broken today (product intent to fix):**

```
1 bid → Disappear / close competition early
```

**Required:**

```
1 bid  → Still Active
4 bids → Still Active
12 bids → Still Active
Award  → Closed
```

Keeping the load visible after the first bid is Phase 1's highest-leverage Reach fix. Closing only on Award (or explicit cancel / expiry) materially improves bidding competition.

### 7. Verified Business Partner unlocks history (Phase 4)

Only after trip completion:

- Completed Jobs
- On-time %
- Average Rating
- Settlement Success
- Disputes
- Repeat Business
- Relationship Age
- Revenue Together
- Last Job

Network becomes **Proven**, not merely Connected.

**Relationship Strength** (later): a single ★★★★★ derived from completed shipments, repeat business, payment behaviour, cancellations, POD quality, communication, disputes — feeding Assist, Escrow, Credit, Insurance, and AI recommendations **without** inventing a second scoring product.

## What this does **not** decide

- Exact Postgres shape (extend `organization_relations.status` vs new commerce-relation table vs event-sourced history). Deferred to Phase 2 schema design after this ADR is accepted.
- Whether organic `connection_requests` still create a social `active` edge in parallel (yes by default — parallel path; do not delete Grow/invite).
- Credit / Insurance / Assist product rules — they **consume** Verified + Strength later; they do not redefine the lifecycle here.
- BidStatus enum renames — Phase 2 may add consent metadata without rewriting the whole bid state machine in Phase 1.

## Relationship to Relationship Guard v1

| Guard v1 | This ADR |
|----------|----------|
| `canAward` requires existing `organization_relations` active | Award requires Bid Consent + award action; creates Execution Partner |
| Connection before eligibility | Consent at bid; relationship earned through execution |
| Social "Accept Relationship" then award | "Award Supplier" with commerce copy |

`docs/architecture/11-relationship-guard-v1.md` remains historical context for the Bid → Award problem statement and the existing `connection_requests` / `organization_relations` inventory. Its **enforcement model** (block award until connected) is rejected for marketplace/Reach awarding under this ADR.

## Implementation order (do not reorder)

### Phase 1 — Highest priority (product / Reach visibility)

1. Fix Reach / marketplace visibility: keep loads visible after bids until Award / cancel / expiry.
2. Add bid **source** tags (Network vs Marketplace).
3. Remove any product or UI rule that ships as "must be connected before award" for marketplace paths.
4. **No** mandatory new relationship table writes in this phase if avoidable — ship visibility and source first.

### Phase 2 — Business Relationship Consent + Execution Partner

1. Bid submission captures Business Relationship Consent.
2. Award creates **Execution Partner** (not Verified, not social `active` as the commerce end-state).
3. Award screen uses the copy contract above.

### Phase 3 — Completion → Verified Business Partner

1. Successful trip completion promotes Execution Partner → Verified Business Partner.
2. Failure paths (cancel, fraud, dispute, no-show) do **not** promote.

### Phase 4 — History + Strength

1. Relationship history panel (jobs, on-time, disputes, revenue, age).
2. Relationship Strength score.
3. Consumers: Assist, Escrow, Credit, Insurance, AI recommendations.

## Acceptance criteria for this ADR

- [ ] Product agrees: commerce-earned lifecycle supersedes Guard v1 for marketplace award.
- [ ] Terminology locked: Business Relationship Consent / Execution Partner / Verified Business Partner.
- [ ] Phase 1 scope agreed as visibility + source tags + no pre-award connect requirement (no schema jump).
- [ ] Explicit rejection of writing social `active` at completion as the first commerce state.

## In one sentence

Pulse Network for marketplace work is earned by executing shipments (Consent → Execution Partner → Verified Partner), not by connecting before award — and Reach stays open until someone is awarded.
