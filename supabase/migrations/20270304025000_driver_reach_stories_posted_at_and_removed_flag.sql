-- Corrected replacement for the stale 20270227120000 draft (never pushed --
-- left on disk as historical evidence, not applied). That draft was written
-- against an older snapshot of get_driver_reach_stories() and, if pushed as
-- written, would have dropped snapshot_rate_offer / direct_bid_counter_amount
-- and reintroduced the awarded/converted-load reel bug that
-- driver_reach_stories_exclude_awarded_history (applied 2026-09-01) fixed.
--
-- This migration starts from the CURRENT live function body (fetched via
-- pg_get_functiondef immediately before writing this file) and adds two
-- new OUT columns, appended at the END of the column list.
--
-- CORRECTION (this file previously used CREATE OR REPLACE and failed a
-- real push with "ERROR: cannot change return type of existing function
-- (SQLSTATE 42P13)"): for a RETURNS TABLE(...) function, Postgres treats
-- the whole OUT-parameter list as the return type and CREATE OR REPLACE
-- refuses ANY change to it, even a pure trailing append. DROP + CREATE is
-- required, same pattern the list_driver_direct_bids_avatar migration
-- already used for the same reason. Confirmed via pg_depend (zero
-- dependent views/functions) that dropping this function is safe.
--
-- New fields:
--   posted_at         -- true original story post date (falls back to
--                         published_at); use for "Xd ago", not published_at.
--   source_deleted_at -- set if the org deleted the source story; the
--                         campaign snapshot keeps delivering, but the client
--                         should show it was removed.
--
-- Everything else -- snapshot_rate_offer, direct_bid_counter_amount, the
-- market_won/direct_won awarded-exclusion, the indent-terminal-state
-- exclusion, and the fleet-owner branch of the authorization check -- is
-- carried over unchanged from the live function.

DROP FUNCTION IF EXISTS public.get_driver_reach_stories();

CREATE FUNCTION public.get_driver_reach_stories()
 RETURNS TABLE(campaign_id uuid, campaign_org_id uuid, org_name text, org_logo_url text, campaign_status text, published_at timestamp with time zone, expires_at timestamp with time zone, snapshot_post_type text, snapshot_title text, snapshot_origin text, snapshot_destination text, snapshot_vehicle_type text, snapshot_material text, snapshot_content text, snapshot_rate_offer numeric, driver_reward_enabled boolean, reward_amount bigint, reward_available boolean, referral_id uuid, referral_status text, referral_reward_amount bigint, recommended_at timestamp with time zone, rewarded_at timestamp with time zone, post_id uuid, direct_bid_status text, direct_bid_amount numeric, direct_bid_counter_amount numeric, posted_at timestamp with time zone, source_deleted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_is_fo boolean := public.is_driver_fleet_owner(v_uid);
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'driver')
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = v_uid AND om.role = 'driver' AND om.status = 'active'
    )
    OR v_is_fo
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a driver';
  END IF;

  RETURN QUERY
  SELECT
    rc.id,
    rc.org_id,
    o.name,
    o.logo_url,
    rc.status,
    rc.published_at,
    rc.expires_at,
    rc.snapshot_post_type,
    rc.snapshot_title,
    rc.snapshot_origin,
    rc.snapshot_destination,
    rc.snapshot_vehicle_type,
    rc.snapshot_material,
    rc.snapshot_content,
    rc.snapshot_rate_offer,
    rc.driver_reward_enabled,
    rc.reward_amount,
    (rc.driver_reward_enabled AND rc.reward_reserved >= rc.reward_amount),
    r.id,
    r.status,
    r.reward_amount,
    r.created_at,
    r.rewarded_at,
    rc.post_id,
    db.status,
    db.amount,
    db.counter_amount,
    coalesce(rc.snapshot_posted_at, rc.published_at) AS posted_at,
    rc.source_deleted_at
  FROM public.reach_campaigns rc
  JOIN public.organizations o ON o.id = rc.org_id
  LEFT JOIN public.posts p ON p.id = rc.post_id
  LEFT JOIN public.reach_referrals r
    ON r.campaign_id = rc.id AND r.driver_user_id = v_uid
  LEFT JOIN public.driver_direct_bids db
    ON db.post_id = rc.post_id AND db.driver_user_id = v_uid
  LEFT JOIN LATERAL (
    SELECT b.id
    FROM public.bids b
    WHERE b.post_id = rc.post_id
      AND b.status = 'accepted'
    ORDER BY b.created_at DESC
    LIMIT 1
  ) market_won ON true
  LEFT JOIN LATERAL (
    SELECT ddb.id
    FROM public.driver_direct_bids ddb
    WHERE ddb.post_id = rc.post_id
      AND ddb.status = 'accepted'
    ORDER BY ddb.created_at DESC
    LIMIT 1
  ) direct_won ON true
  WHERE (
      'driver' = ANY (rc.distribution_channels)
      OR (
        v_is_fo
        AND 'fleet' = ANY (rc.distribution_channels)
        AND upper(coalesce(rc.snapshot_post_type, '')) = 'LOAD'
      )
    )
    AND rc.status = 'active'
    AND (rc.expires_at IS NULL OR rc.expires_at > now())
    -- No marketplace award and no accepted direct bid (any driver).
    AND market_won.id IS NULL
    AND direct_won.id IS NULL
    -- Caller's own bid must still be open (pending / none). Rejected = history.
    AND (db.status IS NULL OR db.status = 'pending')
    -- Indent-linked loads leave the reel when the indent is no longer open
    -- (awarded / completed / cancelled / …) or already executing as a trip.
    AND (
      coalesce(rc.snapshot_source_indent_id, p.source_indent_id) IS NULL
      OR (
        public.indent_open_for_marketplace_bids(
          coalesce(rc.snapshot_source_indent_id, p.source_indent_id)
        )
        AND lower(trim(coalesce(
          (SELECT i.status::text FROM public.indents i
           WHERE i.id = coalesce(rc.snapshot_source_indent_id, p.source_indent_id)),
          ''
        ))) <> ALL (ARRAY['assigned', 'deployed']::text[])
      )
    )
  ORDER BY rc.published_at DESC;
END;
$function$;

COMMENT ON FUNCTION public.get_driver_reach_stories() IS
  'Driver Story / LOADS reel: active boosted opportunities only. Excludes awarded / accepted / rejected / rewarded history and indent-terminal loads (those belong on Wallet / History / trips). posted_at = true original story date (snapshot_posted_at, falls back to published_at); source_deleted_at surfaces org-side deletion for client display.';

-- DROP FUNCTION removes all prior grants; restore the exact grants the
-- live function had before this migration (checked via
-- information_schema.routine_privileges immediately before writing this
-- file: postgres, anon, authenticated, service_role all had EXECUTE).
-- Explicit, not relied-on-by-default, so a future default-privilege change
-- can't silently alter who can call this.
GRANT EXECUTE ON FUNCTION public.get_driver_reach_stories() TO postgres, anon, authenticated, service_role;
