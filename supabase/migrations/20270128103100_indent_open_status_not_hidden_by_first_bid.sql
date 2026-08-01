-- Reach Stability Sprint (Phase 0): a bid must not change indent.status.
--
-- A single bid from ANY supplier flipped an indent's status to 'quoted' -- a
-- shared, global column, not scoped to that bidder. STATUS_TABS.OPEN
-- (features/network/utils/loadCenter.model.ts) is ['open','pending','broadcast',
-- 'draft'], so anything classifying "is this still open for bidding" by reading
-- indent.status stopped matching for EVERY viewer the instant the first bid
-- landed -- not just the bidder. That is the opposite of what a competitive
-- marketplace needs: other eligible suppliers should keep seeing (and be able to
-- bid on) a load until it is awarded, expires, or is cancelled. It also makes
-- concurrent bids contend on the same indent row.
--
-- "Has this indent received a bid" is not lost: it already exists per-(indent,
-- bidder) in direct_quotes/bids, which is what useLoadCenterFilters.ts's Open /
-- My Bids split reads today (myQuoteByIndentId -- per-viewer, not global). Give
-- Load's "Quote received" pill already ORs in a real bid-count check
-- (giveLoadBidReceivedDisplayStatus, loadCenter.model.ts), so it keeps working
-- once indent.status never becomes 'quoted' again.
--
-- Matches the terminal-state pattern established for reach_campaigns
-- (20270113000000_close_reach_campaign_on_indent_terminal.sql): indent.status
-- should only ever represent real lifecycle stages.
--
-- NOTE ON VERSIONING: this shipped twice before at versions 20270126000000 and
-- 20270127000000 and never ran. pulse-unified-base shares this Supabase project
-- and had already recorded its own migrations at both of those versions
-- (market_indents_via_reach, market_indents_via_reach_repair), so `db push`
-- treated these files as applied and skipped them. Hence the off-midnight
-- timestamp here -- the sibling repo uses YYYYMMDD000000.

-- ── 1. Remove the indent-quoted side effect ─────────────────────────────────

DROP TRIGGER IF EXISTS trg_direct_quotes_set_indent_quoted ON public.direct_quotes;
DROP FUNCTION IF EXISTS public.set_indent_quoted_on_direct_quote();

-- ── 2. Backfill stranded 'quoted' indents back to open for bidding ──────────
-- The prior value (open/broadcast/pending) is not retained anywhere. Prefer
-- 'broadcast' when an active LOAD story still points at the indent so story and
-- reach surfaces stay consistent; otherwise 'open', the createIndent() default.
--
-- Deliberately does NOT touch awarded/completed/cancelled/expired indents -- an
-- indent already past 'quoted' reached a real terminal state independently of
-- this trigger.

UPDATE public.indents i
SET
  status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.source_indent_id = i.id
        AND coalesce(p.is_active, false) = true
        AND upper(coalesce(p.type, '')) = 'LOAD'
    ) THEN 'broadcast'
    ELSE 'open'
  END,
  updated_at = now()
WHERE i.status = 'quoted';

COMMENT ON TABLE public.indents IS
  'Indent lifecycle: draft/open/broadcast → awarded → completed/cancelled/expired. '
  'Receiving bids does NOT change status — bid presence lives in bids/direct_quotes.';
