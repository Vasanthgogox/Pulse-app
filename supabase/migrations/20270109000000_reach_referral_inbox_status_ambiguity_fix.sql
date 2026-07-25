-- Fix: get_reach_referral_inbox's RETURNS TABLE declares a `status` column,
-- which PL/pgSQL implicitly binds as an OUT variable in the function body.
-- That collided with organization_members.status in the caller-membership
-- check, so every call failed with "column reference status is ambiguous"
-- (42702) -- the inbox never loaded for anyone. Fix: qualify the table
-- column explicitly. No other change.

CREATE OR REPLACE FUNCTION public.get_reach_referral_inbox(p_fleet_org_id uuid)
RETURNS TABLE (
  id                          uuid,
  campaign_id                 uuid,
  status                      text,
  reward_amount               bigint,
  note                        text,
  reason                      text,
  suggested_rate              numeric,
  created_at                  timestamptz,
  decided_at                  timestamptz,
  rewarded_at                 timestamptz,
  driver_user_id              uuid,
  driver_name                 text,
  driver_phone                text,
  driver_trips_completed      bigint,
  driver_referrals_total      bigint,
  driver_referrals_converted  bigint,
  post_id                     uuid,
  campaign_org_id             uuid,
  campaign_status             text,
  snapshot_post_type          text,
  snapshot_title              text,
  snapshot_origin             text,
  snapshot_destination        text,
  snapshot_vehicle_type       text,
  snapshot_material           text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_fleet_org_id AND om.user_id = (select auth.uid()) AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the fleet organization';
  END IF;

  RETURN QUERY
  SELECT
    r.id, r.campaign_id, r.status, r.reward_amount, r.note, r.reason, r.suggested_rate,
    r.created_at, r.decided_at, r.rewarded_at,
    r.driver_user_id,
    COALESCE(pr.full_name, 'Driver') AS driver_name,
    pr.phone AS driver_phone,
    COALESCE(trip_stats.completed, 0) AS driver_trips_completed,
    COALESCE(ref_stats.total, 0) AS driver_referrals_total,
    COALESCE(ref_stats.converted, 0) AS driver_referrals_converted,
    rc.post_id, rc.org_id AS campaign_org_id, rc.status AS campaign_status,
    rc.snapshot_post_type, rc.snapshot_title, rc.snapshot_origin,
    rc.snapshot_destination, rc.snapshot_vehicle_type, rc.snapshot_material
  FROM public.reach_referrals r
  JOIN public.reach_campaigns rc ON rc.id = r.campaign_id
  LEFT JOIN public.profiles pr ON pr.id = r.driver_user_id
  LEFT JOIN public.drivers d
    ON d.organization_id = r.fleet_org_id AND d.user_id = r.driver_user_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS completed
    FROM public.trips t
    WHERE t.driver_id = d.id AND t.status = 'completed'
  ) trip_stats ON d.id IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE rr.status <> 'recommended') AS total,
      count(*) FILTER (WHERE rr.status = 'rewarded')     AS converted
    FROM public.reach_referrals rr
    WHERE rr.driver_user_id = r.driver_user_id AND rr.id <> r.id
  ) ref_stats ON true
  WHERE r.fleet_org_id = p_fleet_org_id
  ORDER BY (r.status = 'recommended') DESC, r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reach_referral_inbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reach_referral_inbox(uuid) TO authenticated;
