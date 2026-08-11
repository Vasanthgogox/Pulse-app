-- Reach Stability / Boost V2 Option A — deleted source Story vs active campaign bid.
--
-- Product precedent (docs/BOOST_V2_CAMPAIGN_ENGINE.md — Campaign Snapshot Lifecycle):
-- customer bought distribution, not a live posts row. Soft-delete / source_deleted_at
-- stamps the campaign; paid delivery continues from snapshot until campaign ends or
-- the load is assigned (accepted bid).
--
-- Driver Bid Now must use the same eligibility as get_driver_reach_stories:
--   active reach_campaigns + distribution_channels (+ FO fleet/LOAD rule)
--   — NOT posts.is_active.
--
-- 20270210171000 already removed the posts.is_active gate. This migration locks
-- that decision in COMMENT and re-asserts grants so a future recreation cannot
-- silently reintroduce the live-post check without updating this comment.

COMMENT ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) IS
  'Independent driver (incl. Fleet Owner) bids on an active Reach campaign by post_id. Option A (BOOST_V2 snapshot lifecycle): biddability matches get_driver_reach_stories (campaign status + channels); does NOT require posts.is_active. Soft-deleted source Stories remain biddable while the campaign is active and unassigned.';

COMMENT ON FUNCTION public.get_driver_reach_stories() IS
  'Driver Story tab feed from reach_campaigns snapshots (rate offer + direct bid status/amount/counter). Option A: delivery continues from campaign snapshot when source Story is soft-deleted (source_deleted_at / is_active=false); FO fleet-channel LOAD; accepted direct bids stay visible as awarded jobs.';

REVOKE ALL ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_driver_direct_bid(uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_driver_reach_stories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_reach_stories() TO authenticated;
