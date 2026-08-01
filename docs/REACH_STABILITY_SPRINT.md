# Reach Stability Sprint — Phase 0 report

Companion to `docs/ADR-012-commerce-earned-relationship.md`.  
**Scope:** append-only bids, keep loads/stories visible until award, reduce write/invalidation fan-out.  
**Not in scope:** Execution Partner, Verified Business Partner, consent checkbox.

## Root cause (verified against linked remote, 2026-08-01)

| Check | Expected after the Phase 0 migration | Actual on remote |
|-------|--------------------------------------|------------------|
| `trg_direct_quotes_set_indent_quoted` | Dropped | **Still present** (INSERT + UPDATE) |
| `set_indent_quoted_on_direct_quote()` | Dropped | **Still defined** — sets `indents.status = 'quoted'` |
| Indents at `status = 'quoted'` | 0 (backfilled) | **19** (including updates the same day) |

**Why it never ran — migration version collision.** `pulse-unified-base` shares this
Supabase project and had already recorded its own migrations at versions
`20270126000000` (`market_indents_via_reach`) and `20270127000000`
(`market_indents_via_reach_repair`). The Phase 0 files were written at those same
two versions, so `supabase db push` saw the versions in
`supabase_migrations.schema_migrations` and skipped the files entirely — history
said "applied" while the SQL had never executed. Every new pending
`direct_quotes` row therefore still contended on a single indent UPDATE.

The sibling repo timestamps at `YYYYMMDD000000`, so Phase 0 now sits at an
off-midnight version to stay out of its way.

That is the opposite of an append-only bid pipeline:

```
Bid A ──┐
Bid B ──┼──▶ UPDATE indents SET status='quoted'  ◀── row lock / pool pressure
Bid C ──┘
```

## Before / after (pipeline)

| Metric / behaviour | Before | After (this sprint) |
|--------------------|--------|---------------------|
| Indent write on bid | Yes — trigger sets `quoted` | **No** indent status write (repair migration) |
| Load disappears from “open” consumers after first bid | Yes (global `quoted`) | No — status stays `open`/`broadcast` |
| Story deactivated on first bid | No (only terminal statuses) | Still no |
| Client invalidation on bid | `indents.all` + market + quotes + offer-counts + post detail | Narrow: bid keys, post detail, market, my-direct-quotes, offer-counts — **not** full indent lists / feed |
| UI word “Quoted” | Status tabs + pills | **Open Market / Receiving Bids / My Bids** |
| Target rate while bidding | Kept on ticket commerce | Kept (`YOUR BID` + Target reference) |
| Bid CTA until award | Update quote / Bid now | Unchanged product rule |

## Migrations

1. `20270128103000_market_indents_for_org_pin_p_org_id.sql` — pins the live
   `market_indents_for_org(p_org_id uuid)` signature + body into this repo (see
   "Get Load outage" below).
2. `20270128103100_indent_open_status_not_hidden_by_first_bid.sql` — drops
   `trg_direct_quotes_set_indent_quoted` + `set_indent_quoted_on_direct_quote()`
   and backfills `quoted` → `broadcast` (if an active LOAD story points at the
   indent) else `open`. Idempotent.

The two earlier files at `20270126000000` / `20270127000000` were deleted: their
versions belong to `pulse-unified-base` and could never be pushed from here.

**Applied 2026-08-01.** The push was first blocked by an unrelated out-of-order local
file, `20260731000000_has_platform_permission_bootstrap_stub.sql`. `--include-all` was
**not** used: that stub is `SELECT false` and would have overwritten the real,
table-backed `has_platform_permission` on production. It was resolved with a targeted
history repair instead, since remote already had the real implementation:

```bash
supabase migration repair --status applied 20260731000000 --linked
supabase db push --linked
```

## Get Load outage (2026-08-01) — same shared-project root cause

`pulse-unified-base`'s `market_indents_via_reach` migration recreated
`public.market_indents_for_org` with the parameter renamed `org_id` → `p_org_id`
(and a new `via_reach` branch for sponsored loads). This app still posted
`{ org_id }`, so PostgREST answered `PGRST202` — "Could not find the function
public.market_indents_for_org(org_id)". Get Load fell through to the direct-table
fallback, which then hit `PGRST201`: `indents` has two foreign keys to
`organizations` (`organization_id` and `assigned_supplier_id`), so the bare
`organizations(name)` embed is ambiguous. Result: every Load Center tab read 0
and the board showed "Unable to load loads".

Fixes:

- `features/indents/services/indents.service.ts` — RPC arg renamed to `p_org_id`;
  both `indents` embeds now name the constraint
  (`organizations!indents_organization_id_fkey(name)`).
- `lib/database.types.ts` — `market_indents_for_org` Args updated.
- Migration 1 above so this repo's history and a local `db reset` match remote.

## Concurrency acceptance (manual / load test)

Not automated in CI yet. Suggested script shape:

1. Pick one active LOAD story + open indent (or create fixture).
2. Fire **100** parallel `submit_pulse_bid_with_direct_quote` from 100 distinct bidder orgs (or serialized unique org ids in a staging project).
3. Assert: 100 success responses; indent status still `open`/`broadcast`; `direct_quotes` count = 100; no Postgres deadlock errors; app UI remains responsive on story detail.

**Before repair:** expect indent row lock waits and status=`quoted` after bid #1.  
**After repair:** expect append-only `bids` + `direct_quotes` upserts only.

## Client files touched

- `lib/queries/useBidsQuery.ts` — narrowed post-bid invalidation
- `features/network/components/bidding/BidSheet.tsx` — dropped `indents.all` invalidation
- `features/network/utils/loadCenter.model.ts` — marketplace labels; OPEN includes legacy `quoted`
- `features/network/hooks/useLoadCenterFilters.ts` — Open Market vs Receiving Bids comments/rules
- Cards / pills — “quoted” copy → receiving bids / bid

## Remaining Phase 0 follow-ups

- [x] Push `20270128103100` and confirm trigger gone — applied 2026-08-01; verified
      `trg_direct_quotes_set_indent_quoted` = 0, `set_indent_quoted_on_direct_quote()` = 0,
      indents at `status='quoted'` = 0, `market_indents_for_org` still `p_org_id` with
      `via_reach` intact, `has_platform_permission` still the real implementation.
- [x] Version convention agreed: q-web uses off-midnight timestamps
      (`.cursor/rules/supabase-migrations.mdc`)
- [x] Phase A product cleanup — freeze `quoted` as deprecated compatibility only
      (see below)
- [ ] 100-bid concurrency run with timings (p50/p95 RPC ms, DB wait events)
- [ ] Story card “evolution” strip (Network vs Marketplace counts, best bid, last bid) — P1 polish
- [ ] Evaluating tab (optional product split from Receiving Bids)

## Phase A — product freeze of `quoted` (2026-08-01)

**Data layer (done):** trigger gone, 0 rows at `status='quoted'`, bids no longer mutate indent status.

**DB compatibility (keep):** do not drop `quoted` from check constraints / historical migrations / rollback path. Treat as deprecated internal value.

**Product logic (done this pass):**

| Area | Decision |
|------|----------|
| `STATUS_TABS.OPEN` | Still accepts `quoted` — **legacy compatibility only** (commented) |
| `STATUS_TABS.QUOTED.statuses` | **Empty** — tab is bid-count / my-quote driven, not DB status |
| Give Load Receiving Bids filter | Bid count only — removed `isQuotedStatus` OR |
| UI copy | Open Market / Receiving Bids / My Bids — never “Quoted” |
| Promo empty states | Retitled; asset keys `give_quoted` / `get_quoted` kept (internal ids) |
| Indent detail bid-enabled set | Still includes `quoted` with legacy comment |
| Enum / RPC `quoted_indents_for_org` | Untouched (name = “indents I bid on”, not status) |

**Next engineering focus (do not reopen `quoted`):**

Canonical map: **`docs/MARKETPLACE_DOMAIN.md`** (Marketplace Platform milestones).

```
✓ M0 Stabilization
➡ M1 Commercial Resolver   ← build next (not more Reach UI / badges / filters)
  M2 Marketplace Experience
  M3 Commerce Intelligence
  M4 Commerce Network (ADR-012)
  M5 Financial Platform
```

## Explicitly deferred to ADR-012 Phase 1+

Business Relationship Consent, Execution Partner, Verified Business Partner, Relationship Strength.
