-- Reach campaigns kept serving paid impressions after their load was awarded.
--
-- Awarding an indent fires deactivate_posts_for_terminal_indent, which sets
-- posts.is_active = false and rejects pending bids. It never touched
-- reach_campaigns. Nothing else did either: the only paths that close a
-- campaign are fn_expire_reach_campaigns (cron, purely on expires_at),
-- cancel_reach_campaign (manual), and upgrade/referral conversion.
--
-- So an awarded load's campaign stayed 'active' until its timer ran out. That
-- is not merely a stale badge:
--
--   * get_network_feed Branch B deliberately keeps serving a sponsored card
--     from the campaign snapshot when the post row is gone, so paid
--     impressions do not dead-end (see 20270112000000). Correct for a live
--     campaign — but combined with this gap it means an awarded load keeps
--     being advertised, and keeps accruing impressions, after nobody can act
--     on it.
--   * Bids are force-rejected on award, so such a campaign can never register
--     a result no matter how much reach it burns. Results are pinned at 0.
--   * Referral escrow (reward_reserved) stayed locked until expiry instead of
--     returning to the org's wallet.
--
-- Fix: when an indent reaches a terminal state, complete its active campaigns
-- in the same transaction and release their escrow.
--
-- Money semantics (deliberate, matches expiry): the boost fee is NOT refunded.
-- Those impressions were really delivered — the org paid for reach and got
-- reach. Only the referral escrow comes back, because that is a reservation
-- against rewards that can now never be earned, not a spend.
-- fn_release_reach_referral_escrow already handles that, is idempotent
-- (reward_reserved <= 0 returns early), and also expires pending referrals.

-- ── 1. Provenance for a completed campaign ──────────────────────────────────
-- completed_at alone cannot distinguish "ran its full course" from "cut short
-- because the load went away". Support wants that distinction, and so does any
-- future refund policy that revisits the decision above.

ALTER TABLE public.reach_campaigns
  ADD COLUMN IF NOT EXISTS completion_reason text;

ALTER TABLE public.reach_campaigns
  DROP CONSTRAINT IF EXISTS reach_campaigns_completion_reason_check;

ALTER TABLE public.reach_campaigns
  ADD CONSTRAINT reach_campaigns_completion_reason_check
  CHECK (
    completion_reason IS NULL
    OR completion_reason IN ('expired', 'source_terminal')
  );

COMMENT ON COLUMN public.reach_campaigns.completion_reason IS
  'Why a campaign completed: expired (ran its full duration) or source_terminal (its load was awarded/completed/cancelled early). Null for campaigns completed before this was tracked, and for non-completed rows.';

-- ── 2. Shared close routine ─────────────────────────────────────────────────
-- One implementation used by both the trigger and the backfill, so the two can
-- never drift. Takes indent ids so it can serve a statement-level trigger
-- handling multi-row UPDATEs (a per-row FOR EACH ROW trigger silently misses
-- bulk awards).
--
-- Campaign→indent linkage is resolved two ways on purpose:
--   a) posts.source_indent_id — the live post row
--   b) reach_campaigns.snapshot_source_indent_id — retained when the post is
--      deleted, which is exactly the case where the snapshot keeps serving
-- Resolving only (a) would miss campaigns precisely when Branch B is what is
-- still advertising them.

CREATE OR REPLACE FUNCTION public.fn_complete_reach_campaigns_for_indents(
  p_indent_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    uuid;
  v_count integer := 0;
BEGIN
  IF p_indent_ids IS NULL OR array_length(p_indent_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_id IN
    WITH closed AS (
      UPDATE public.reach_campaigns rc
      SET status            = 'completed',
          completed_at      = now(),
          completion_reason = 'source_terminal'
      WHERE rc.status = 'active'
        AND (
          rc.snapshot_source_indent_id = ANY (p_indent_ids)
          OR EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = rc.post_id
              AND p.source_indent_id = ANY (p_indent_ids)
          )
        )
      RETURNING rc.id, rc.org_id
    )
    SELECT id FROM closed
  LOOP
    v_count := v_count + 1;

    -- Returns unspent referral escrow to the wallet and expires pending
    -- referrals. Idempotent, and a no-op when no reward was enabled.
    PERFORM public.fn_release_reach_referral_escrow(v_id);

    PERFORM public.emit_platform_event(
      'ReachCampaignCompleted',
      (SELECT org_id FROM public.reach_campaigns WHERE id = v_id),
      jsonb_build_object(
        'campaign_id', v_id,
        'reason', 'source_terminal'
      )
    );
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_complete_reach_campaigns_for_indents(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_complete_reach_campaigns_for_indents(uuid[]) TO service_role;

COMMENT ON FUNCTION public.fn_complete_reach_campaigns_for_indents(uuid[]) IS
  'Completes active Reach campaigns whose source indent went terminal, releasing referral escrow. Boost fee is intentionally not refunded (impressions were delivered). Resolves campaigns via posts.source_indent_id and the retained snapshot_source_indent_id.';

-- ── 3. Statement-level trigger on indents ───────────────────────────────────
-- Statement-level + transition table, not FOR EACH ROW: a bulk award
-- (UPDATE indents SET status='awarded' WHERE id IN (...)) must close every
-- affected campaign, and this collapses it to one pass instead of N.
--
-- Terminal set matches deactivate_posts_for_terminal_indent exactly, so a load
-- can never be in the state "post deactivated but campaign still serving".
-- 'broadcast'/'open'/'quoted' are explicitly NOT terminal — a quoted load is
-- still biddable and its campaign should keep running.

CREATE OR REPLACE FUNCTION public.trg_complete_reach_campaigns_on_indent_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(n.id)
  INTO v_ids
  FROM new_rows n
  JOIN old_rows o ON o.id = n.id
  WHERE n.status IS DISTINCT FROM o.status
    AND lower(trim(coalesce(n.status::text, ''))) = ANY (
      ARRAY['awarded', 'completed', 'cancelled', 'closed', 'expired']::text[]
    );

  IF v_ids IS NOT NULL THEN
    PERFORM public.fn_complete_reach_campaigns_for_indents(v_ids);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_indents_complete_reach_campaigns ON public.indents;

CREATE TRIGGER trg_indents_complete_reach_campaigns
  AFTER UPDATE ON public.indents
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_complete_reach_campaigns_on_indent_terminal();

COMMENT ON FUNCTION public.trg_complete_reach_campaigns_on_indent_terminal() IS
  'Closes Reach campaigns when their indent goes terminal. Statement-level with transition tables so bulk awards are handled in one pass.';

-- ── 4. Record the reason on the time-based path too ─────────────────────────
-- Without this, expiry would leave completion_reason null and the new column
-- would only ever be populated by the trigger — making "why did this end?"
-- unanswerable for the common case. Preserves the escrow-release loop added in
-- 20270108000000; only the reason stamp is new.

CREATE OR REPLACE FUNCTION public.fn_expire_reach_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    WITH expired AS (
      UPDATE public.reach_campaigns
      SET status            = 'completed',
          completed_at      = now(),
          completion_reason = 'expired'
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < now()
      RETURNING id
    )
    SELECT id FROM expired
  LOOP
    PERFORM public.fn_release_reach_referral_escrow(v_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_expire_reach_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_expire_reach_campaigns() TO service_role;

-- ── 5. Backfill ─────────────────────────────────────────────────────────────
-- Campaigns already stranded 'active' on a terminal load. Reuses the same
-- routine, so backfilled rows are indistinguishable from ones the trigger
-- closes and their escrow is released identically.

DO $$
DECLARE
  v_ids   uuid[];
  v_count integer;
BEGIN
  SELECT array_agg(DISTINCT i.id)
  INTO v_ids
  FROM public.indents i
  WHERE lower(trim(coalesce(i.status::text, ''))) = ANY (
    ARRAY['awarded', 'completed', 'cancelled', 'closed', 'expired']::text[]
  );

  IF v_ids IS NULL THEN
    RAISE NOTICE 'reach backfill: no terminal indents';
    RETURN;
  END IF;

  v_count := public.fn_complete_reach_campaigns_for_indents(v_ids);
  RAISE NOTICE 'reach backfill: completed % stranded campaign(s)', v_count;
END;
$$;
