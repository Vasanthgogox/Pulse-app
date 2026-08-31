# Phase B — Market/DCO Lifecycle QA Plan (fixtures + execution matrix)

**Status: DRAFT — documentation only. Nothing described here has been created yet.**
No production data was modified to write this document — every fact below came from read-only
`pg_get_functiondef` / `information_schema` / `pg_policies` queries against the linked project.

Scope: prove the WS1/WS6 Market lifecycle (`market_bids`, `accept_market_bid`,
`reject_market_bid`, `_resolve_or_create_market_driver`, `release_and_reopen_indent`)
end-to-end and under concurrency/RLS stress, using fully synthetic identities in an
isolated environment. Backend design/build for this lifecycle is already complete and
live (Release 2) — this plan only proves it, it does not add to it.

## Constraints (as given, non-negotiable)

- No real user account, real teammate, or production organization gets modified.
- No synthetic identity or fixture gets created in the shared linked project
  (`nafxpivddesgsrthmosv`) that this repo's `.env` currently points at — that project
  is where real org/driver data and the reviewed WS1/WS6 migrations live.
- No migration repair, no application code changes, no new UI.
- Nothing in the pending migration backlog (manager-surface RPC, Reach Stories
  rewrite, the 3 concurrent Reach/Counter migrations) gets pulled into this.
- Stop after this document — no fixture, org, user, or environment gets created until
  it's explicitly approved.

## Environment decision — RESOLVED: `pulsetrack` is not usable

Read-only inspection performed (link → query → **immediately re-link back**, no
migration/reset/pull/push run against it):

- Linked to `tedlasfvskwkgomhkjhu` only long enough to run three read-only queries,
  then re-linked back to `nafxpivddesgsrthmosv` and confirmed restored
  (`market_bids` present again = 1 row match on the real project).
- `pulsetrack`'s entire `public` schema is 4 tables: **`activity_log`, `comments`,
  `profiles`, `tickets`** — a support/ticketing-style schema, not Pulse's schema at
  all (no `organizations`, `indents`, `trips`, `drivers`, nothing recognizable).
- **8 rows in `auth.users`** — real signups for whatever this project actually is.
- None of the 7 Release 2 Market/DCO objects exist there (`market_bids` table,
  `submit_market_bid`, `accept_market_bid`, `reject_market_bid`,
  `_resolve_or_create_market_driver`, `release_and_reopen_indent` — zero matches).

**Verdict: this is someone else's real, distinct application, not a blank or
Pilot-related staging project.** Per your own instruction, stopping here and not
touching it further — no fixtures, no migrations, nothing.

**A fresh, purpose-created Supabase project is therefore the environment path** —
still not created; still needs your explicit go-ahead to provision it and replay the
Release 1A + Release 2 migration set onto it.

## Migration set for the isolated project

Whichever environment is chosen, it should mirror **exactly** what's live on the
linked project today — the 15 Release 1A migrations + the 7 Release 2 (WS1/WS6)
migrations — and **exclude** the 2 pending legacy files and the 3 concurrent
Reach/Counter files, per your explicit "don't mix the migration backlog into this"
instruction from the last phase.

## Fixture set (synthetic, isolated project only)

Verified against the live RPC/table definitions (`submit_market_bid`,
`accept_market_bid`, `reject_market_bid`, `_resolve_or_create_market_driver`,
`indent_open_for_marketplace_bids`, `is_driver_fleet_owner`) — these are the actual
gates the fixtures must satisfy, not assumptions:

| # | Entity | Purpose | Must satisfy |
|---|--------|---------|---------------|
| 1 | Synthetic Business org (`organizations`) | Owns the Indent, receives the bid | Row exists; `id` used as `indents.organization_id` |
| 2 | Synthetic Business accepter (`auth.users` + `profiles` + `organization_members`) | Calls `accept_market_bid`/`reject_market_bid` | `organization_members.status='active'`, `role` one of `owner/admin/member/dispatcher/finance` (the RPCs only exclude `role='driver'`, which isn't even a valid value for this table) |
| 3 | Synthetic Driver / DCO #1 (`auth.users` + `profiles` + `driver_fleet_owner_profiles`) | Submits the winning Market bid | Row in `driver_fleet_owner_profiles` (checked by `is_driver_fleet_owner()`) |
| 4 | Synthetic Driver #1's vehicle (`owner_vehicles`) | Carried on the bid as `owner_vehicle_id` | `owner_user_id` = Driver #1, `status='active'`, not soft-deleted |
| 5 | Synthetic Indent (`indents`) | The demand object being bid on | `organization_id` = Business org; `status='open'` (satisfies both `indent_open_for_marketplace_bids` for submit AND the stricter `open`/`broadcast` check inside `accept_market_bid`); NOT NULL fields: `client_name`, `client_price`, `drop_location`, `indent_number`, `pickup_area`, `supplier_target` |

Additional fixtures needed only for specific B3 scenarios (see matrix below):

| # | Entity | Needed for |
|---|--------|-------------|
| 6 | Synthetic Driver / DCO #2 (+ fleet-owner profile) | Competing-award scenario |
| 7 | Synthetic "outsider" driver (never bids) | RLS bidder-isolation scenario |
| 8 | A second, unrelated Synthetic org + member | RLS owner-org-visibility scenario |
| 9 | A stale `drivers` row in the Business org: same phone as Driver #1, different `user_id`, `left_at IS NULL` | Driver identity/phone-hijack-protection scenario |

## B2 — full lifecycle execution steps

1. Driver #1 signs in (synthetic), opens Market → Find Work → Market loads, sees the
   synthetic Indent.
2. Driver #1 calls `submit_market_bid(indent_id, amount, owner_vehicle_id=vehicle)`.
   Expect: new `market_bids` row, `status='pending'`, `bidder_type='dco'`.
3. Driver #1 sees it under My Bids as "Pending".
4. Business accepter calls `accept_market_bid(bid_id)`.
   Expect: `market_bids.status='accepted'`; new `trips` row with
   `source='market_bid'`, `source_bid_id`, `indent_id`, `driver_id` resolved via
   `_resolve_or_create_market_driver` (new `drivers` row, `relationship_origin='market_award'`,
   `relationship_status='independent'`, `tracking_only=true`); `indents.status='awarded'`.
5. Driver #1 sees the trip under Market → My Bids as "Accepted", with a route line
   resolved from the awarded trip.
6. Driver #1's History → Market filter shows the same trip.
7. Confirm the canonical-trip invariant: exactly one non-cancelled trip exists for
   this `indent_id` (the narrowed `trips_one_per_indent` unique index).

## B3 — concurrency / security matrix

| Scenario | Setup | Expected result |
|---|---|---|
| Duplicate bid | Driver #1 calls `submit_market_bid` twice on the same open indent | Second call updates the same pending row (`ON CONFLICT (indent_id, bidder_user_id)`), not a duplicate row |
| Duplicate accept | Business accepter calls `accept_market_bid` twice on the same bid | Second call is a no-op returning the same `trip_id` (idempotency check before the pending-status guard) — no second trip, no error |
| Competing awards | Driver #1 and Driver #2 both bid on the same indent; accept both bids concurrently | Exactly one succeeds and creates the trip; the other fails `already_awarded` (guarded by the indent row lock, `FOR UPDATE`, taken before either trip check) |
| Concurrent award vs reopen | `accept_market_bid` and `release_and_reopen_indent` fired concurrently on the same indent | One completes, the other observes the post-lock state and fails cleanly (no split-brain: indent both awarded and reopened) |
| RLS: bidder isolation | Outsider driver (fixture #7) queries `market_bids` for this indent | Zero rows returned |
| RLS: owner-org visibility | Member of an unrelated org (fixture #8) queries `market_bids` for this indent | Zero rows returned |
| Driver identity enforcement | Fixture #9 (stale same-phone, different `user_id` row) exists in the Business org when Driver #1's bid is accepted | `_resolve_or_create_market_driver` does NOT hijack the stale row (different `user_id`) — creates a separate `drivers` row for Driver #1 instead, matching the documented phone-collision protection |
| Canonical trip / indent invariant | After award, attempt to insert a second non-cancelled `trips` row with the same `indent_id` directly (bypassing the RPC) | Rejected by the `trips_one_per_indent` unique index itself, not just the RPC's application-level check |

## Explicitly out of scope for this plan

- Business-capacity (`bidder_type='organization'`) bidding — `accept_market_bid`
  still raises `not_implemented` for this path; nothing to test yet.
- Counter-on-Market — doesn't exist on this backend; not part of this lifecycle.
- The pending migration backlog (manager-surface RPC, Reach Stories rewrite, 3
  concurrent Reach/Counter migrations) — separate release track.
- Any UI/UX change — Market UX phase is closed per your last message.

---

**Stopping here per instruction.** Waiting on your answer to the open environment
decision above before creating anything — any org, user, or fixture row, in any
project.
