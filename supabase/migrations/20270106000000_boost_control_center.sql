-- Boost Control Center — INTERNAL operations dashboard RPC (read-only).
-- Not customer-facing: served to the admin analytics console so the team
-- understands the marketplace before customers ask. Closes the Boost V2 epic;
-- no schema changes here, only aggregation over existing tables.
--
-- "Healthy" is a simplified server-side rule (any engagement relative to the
-- campaign's elapsed time) — the customer-facing per-campaign health card
-- does the richer factor scoring client-side.

CREATE OR REPLACE FUNCTION public.get_boost_control_center()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Service-role callers (admin console) have no auth.uid(); authenticated
  -- callers need the platform analytics permission.
  IF (select auth.uid()) IS NOT NULL
     AND NOT public.has_platform_permission((select auth.uid()), 'analytics.view') THEN
    RAISE EXCEPTION 'unauthorized: analytics.view permission required';
  END IF;

  WITH active AS (
    SELECT
      rc.*,
      LEAST(1.0, GREATEST(0.1,
        EXTRACT(epoch FROM (now() - rc.published_at))
        / NULLIF(EXTRACT(epoch FROM (rc.expires_at - rc.published_at)), 0)
      )) AS elapsed_fraction,
      COALESCE(rp.estimated_reach_min, 0) AS est_min,
      (SELECT count(*) FROM public.reach_events e
        WHERE e.campaign_id = rc.id AND e.event_type = 'impression') AS impressions,
      (SELECT count(*) FROM public.bids b WHERE b.post_id = rc.post_id) AS bid_count,
      (SELECT count(*) FROM public.reach_referrals r WHERE r.campaign_id = rc.id) AS referral_count
    FROM public.reach_campaigns rc
    LEFT JOIN public.reach_plans rp ON rp.id = rc.plan_id
    WHERE rc.status = 'active'
  ),
  active_health AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE
        bid_count > 0 OR referral_count > 0
        OR impressions >= 0.5 * est_min * elapsed_fraction
      ) AS healthy
    FROM active
  ),
  lanes AS (
    SELECT
      rc.snapshot_origin AS origin,
      rc.snapshot_destination AS destination,
      count(DISTINCT rc.id) AS campaigns,
      COALESCE(sum(b.cnt), 0) AS bids,
      COALESCE(sum(rr.converted), 0) AS conversions
    FROM public.reach_campaigns rc
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt FROM public.bids b WHERE b.post_id = rc.post_id
    ) b ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE r.status = 'rewarded') AS converted
      FROM public.reach_referrals r WHERE r.campaign_id = rc.id
    ) rr ON true
    WHERE rc.snapshot_origin IS NOT NULL AND rc.snapshot_destination IS NOT NULL
    GROUP BY rc.snapshot_origin, rc.snapshot_destination
    HAVING COALESCE(sum(b.cnt), 0) + COALESCE(sum(rr.converted), 0) > 0
    ORDER BY (COALESCE(sum(rr.converted), 0) * 3 + COALESCE(sum(b.cnt), 0)) DESC
    LIMIT 5
  ),
  reward_effect AS (
    SELECT
      r.reward_amount,
      count(*) FILTER (WHERE r.status <> 'recommended') AS decided,
      count(*) FILTER (WHERE r.status = 'rewarded') AS converted
    FROM public.reach_referrals r
    WHERE r.reward_amount > 0
    GROUP BY r.reward_amount
    HAVING count(*) FILTER (WHERE r.status = 'rewarded') > 0
    ORDER BY count(*) FILTER (WHERE r.status = 'rewarded') DESC,
      (count(*) FILTER (WHERE r.status = 'rewarded'))::numeric
        / NULLIF(count(*) FILTER (WHERE r.status <> 'recommended'), 0) DESC
    LIMIT 1
  ),
  adoption AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE 'driver' = ANY(distribution_channels)) AS with_driver
    FROM public.reach_campaigns
  ),
  timings AS (
    SELECT
      avg(EXTRACT(epoch FROM (decided_at - created_at)) / 60)
        FILTER (WHERE decided_at IS NOT NULL) AS rec_to_decision_min,
      avg(EXTRACT(epoch FROM (rewarded_at - decided_at)) / 3600)
        FILTER (WHERE rewarded_at IS NOT NULL AND decided_at IS NOT NULL) AS approval_to_trip_hr
    FROM public.reach_referrals
  )
  SELECT jsonb_build_object(
    'active_campaigns', ah.total,
    'healthy', ah.healthy,
    'need_attention', ah.total - ah.healthy,
    'top_lanes', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'origin', l.origin, 'destination', l.destination,
        'campaigns', l.campaigns, 'bids', l.bids, 'conversions', l.conversions
      )) FROM lanes l),
      '[]'::jsonb
    ),
    'most_effective_reward', (
      SELECT jsonb_build_object(
        'reward_amount', re.reward_amount,
        'decided', re.decided,
        'converted', re.converted
      ) FROM reward_effect re
    ),
    'driver_story_adoption_pct', (
      SELECT CASE WHEN a.total = 0 THEN 0
        ELSE round(100.0 * a.with_driver / a.total) END
      FROM adoption a
    ),
    'avg_recommendation_to_decision_min', (SELECT round(t.rec_to_decision_min::numeric, 1) FROM timings t),
    'avg_approval_to_trip_hr', (SELECT round(t.approval_to_trip_hr::numeric, 1) FROM timings t)
  )
  INTO v_result
  FROM active_health ah;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_boost_control_center() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_boost_control_center() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_boost_control_center IS
  'INTERNAL Boost Control Center (admin analytics console): active campaign health split, top lanes, most effective reward, driver story adoption, and funnel timings. Requires analytics.view for authenticated callers; service_role passes.';
