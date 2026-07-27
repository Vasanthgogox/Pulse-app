-- Reach daily aggregation silently loses a day if the cron misses a run.
--
-- fn_aggregate_reach_daily_metrics only ever wrote (now() - 1 day) and runs once
-- daily at 03:15. get_reach_campaign_metrics reads
--   sum(reach_campaign_daily_metrics) + live tail for TODAY only.
-- So any day that is neither "today" nor successfully materialized is invisible:
-- the raw reach_events rows still exist, but nothing ever reads them again. A
-- single failed/skipped cron run permanently understates a customer's
-- impressions, views, and bids — for a metric they paid for.
--
-- Verified before writing: no data is currently lost (materialized totals match
-- the true pre-today event counts for every campaign), so this hardens the
-- design rather than repairing damage.
--
-- Fix: aggregate every un-materialized day that has activity, not just
-- yesterday. Idempotent via the existing (campaign_id, day) upsert, so re-runs
-- and catch-up runs converge on the same numbers.

CREATE OR REPLACE FUNCTION public.fn_aggregate_reach_daily_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Candidate days: every date with campaign activity, excluding today (still
  -- served by the live tail in get_reach_campaign_metrics — materializing a
  -- partial today would double-count against that tail).
  WITH activity_days AS (
    SELECT DISTINCT rc.id AS campaign_id, d.day
    FROM public.reach_campaigns rc
    JOIN LATERAL (
      SELECT (e.created_at AT TIME ZONE 'UTC')::date AS day
      FROM public.reach_events e
      WHERE e.campaign_id = rc.id
      UNION
      SELECT (b.created_at AT TIME ZONE 'UTC')::date
      FROM public.bids b
      WHERE b.post_id = rc.post_id
      UNION
      SELECT (t.created_at AT TIME ZONE 'UTC')::date
      FROM public.pulse_credit_transactions t
      WHERE t.type = 'spend_reach'
        AND t.reference_type = 'reach_campaign_purchase'
        AND t.reference_id = rc.id
    ) d ON true
    WHERE rc.status IN ('active', 'completed')
      AND d.day < (now() AT TIME ZONE 'UTC')::date
  )
  INSERT INTO public.reach_campaign_daily_metrics
    (campaign_id, day, impressions, views, bids, credits_used)
  SELECT
    a.campaign_id,
    a.day,
    COALESCE((
      SELECT count(*) FROM public.reach_events e
      WHERE e.campaign_id = a.campaign_id
        AND e.event_type = 'impression'
        AND (e.created_at AT TIME ZONE 'UTC')::date = a.day
    ), 0),
    COALESCE((
      SELECT count(*) FROM public.reach_events e
      WHERE e.campaign_id = a.campaign_id
        AND e.event_type = 'view'
        AND (e.created_at AT TIME ZONE 'UTC')::date = a.day
    ), 0),
    COALESCE((
      SELECT count(*) FROM public.bids b
      JOIN public.reach_campaigns rc2 ON rc2.id = a.campaign_id
      WHERE b.post_id = rc2.post_id
        AND (b.created_at AT TIME ZONE 'UTC')::date = a.day
    ), 0),
    COALESCE((
      SELECT sum(-t.amount) FROM public.pulse_credit_transactions t
      WHERE t.type = 'spend_reach'
        AND t.reference_type = 'reach_campaign_purchase'
        AND t.reference_id = a.campaign_id
        AND (t.created_at AT TIME ZONE 'UTC')::date = a.day
    ), 0)
  FROM activity_days a
  ON CONFLICT (campaign_id, day) DO UPDATE SET
    impressions  = EXCLUDED.impressions,
    views        = EXCLUDED.views,
    bids         = EXCLUDED.bids,
    credits_used = EXCLUDED.credits_used;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_aggregate_reach_daily_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_aggregate_reach_daily_metrics() TO service_role;

COMMENT ON FUNCTION public.fn_aggregate_reach_daily_metrics() IS
  'Materializes Reach daily metrics for every un-aggregated past day with activity (not just yesterday), so a missed cron run self-heals on the next run instead of permanently losing that day. Excludes today, which get_reach_campaign_metrics still serves from the live event tail.';

-- Run once so any pre-existing gap is closed immediately.
SELECT public.fn_aggregate_reach_daily_metrics();
