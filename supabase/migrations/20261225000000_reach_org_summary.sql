-- Reach org summary — the "overall analytics" rollup for the Reach History
-- page: totals across ALL the org's campaigns (not per-campaign), plus how
-- many are currently active. Same materialized+live-tail shape as
-- get_reach_campaign_metrics, just aggregated over every campaign instead of
-- one, so the client isn't doing an N+1 fetch-per-campaign to show a total.

CREATE OR REPLACE FUNCTION public.get_reach_org_summary(p_org_id uuid)
RETURNS TABLE (
  impressions       bigint,
  views             bigint,
  bids              bigint,
  credits_used      bigint,
  active_campaigns  bigint,
  total_campaigns   bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_org_id AND user_id = (select auth.uid()) AND status = 'active'
    )
    OR public.has_platform_permission((select auth.uid()), 'analytics.view')
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of org % or hold analytics.view', p_org_id;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT sum(m.impressions) FROM public.reach_campaign_daily_metrics m
      JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id
    ), 0)::bigint
      + COALESCE((
      SELECT count(*) FROM public.reach_events e
      JOIN public.reach_campaigns rc ON rc.id = e.campaign_id
      WHERE rc.org_id = p_org_id AND e.event_type = 'impression' AND e.created_at >= date_trunc('day', now())
    ), 0),
    COALESCE((
      SELECT sum(m.views) FROM public.reach_campaign_daily_metrics m
      JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id
    ), 0)::bigint
      + COALESCE((
      SELECT count(*) FROM public.reach_events e
      JOIN public.reach_campaigns rc ON rc.id = e.campaign_id
      WHERE rc.org_id = p_org_id AND e.event_type = 'view' AND e.created_at >= date_trunc('day', now())
    ), 0),
    COALESCE((
      SELECT sum(m.bids) FROM public.reach_campaign_daily_metrics m
      JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id
    ), 0)::bigint
      + COALESCE((
      SELECT count(*) FROM public.bids b
      JOIN public.reach_campaigns rc ON rc.post_id = b.post_id
      WHERE rc.org_id = p_org_id AND b.created_at >= date_trunc('day', now())
    ), 0),
    COALESCE((
      SELECT sum(m.credits_used) FROM public.reach_campaign_daily_metrics m
      JOIN public.reach_campaigns rc ON rc.id = m.campaign_id WHERE rc.org_id = p_org_id
    ), 0)::bigint
      + COALESCE((
      SELECT sum(-t.amount) FROM public.pulse_credit_transactions t
      JOIN public.reach_campaigns rc ON rc.id = t.reference_id AND t.reference_type = 'reach_campaign_purchase'
      WHERE rc.org_id = p_org_id AND t.type = 'spend_reach' AND t.created_at >= date_trunc('day', now())
    ), 0)::bigint,
    (SELECT count(*) FROM public.reach_campaigns WHERE org_id = p_org_id AND status = 'published'),
    (SELECT count(*) FROM public.reach_campaigns WHERE org_id = p_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_reach_org_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reach_org_summary(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_reach_org_summary IS
  'Overall Reach analytics for an org: totals across all campaigns + active/total campaign counts. Powers the Reach History page header.';
