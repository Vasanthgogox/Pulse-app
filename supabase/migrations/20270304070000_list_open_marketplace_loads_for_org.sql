-- A4.1: Business "Find Loads" discovery.
--
-- Read-only, membership-gated list of open Marketplace/both indents that a
-- business organization could bid on (as a capacity provider), from orgs it
-- has no existing relationship with. Mirrors
-- list_open_marketplace_loads_for_fleet_owner's shape for the Driver App, but
-- gated on organization membership instead of profiles.role = 'driver'.
--
-- Per docs/MARKETPLACE_DOMAIN.md "Distribution vs monetization": this RPC is
-- the discovery/read authority only — any active member of p_org_id may see
-- these opportunities. It is NOT the bid-eligibility authority; that remains
-- resolveCommercialOpportunity()'s viewerCanBidCapability (client-side today,
-- via the sales.marketplace.bid member surface), and
-- submit_pulse_bid_with_direct_quote remains the sole transactional authority
-- for placing a bid. Discovery and bidding are deliberately separate checks.
--
-- Reach sponsorship (is_sponsored / reach_campaign_id) means: this specific
-- org (p_org_id) is an intended Reach recipient for this indent/post — not
-- "this post has some active campaign" (get_network_feed's org-agnostic
-- sense, which would badge every viewer identically regardless of whether
-- they were ever targeted). Uses the same reach_campaign_targets join and
-- live-campaign conditions as market_indents_for_org's via_reach CTE
-- (t.org_id = p_org_id, t.released_at IS NOT NULL, c.archived_at IS NULL,
-- c.status = 'active' AND (c.expires_at IS NULL OR c.expires_at > now())).
-- Resolved via a LATERAL subquery with ORDER BY + LIMIT 1 so a match is
-- read at most once per indent, however many overlapping targets/campaign
-- rows exist for that org — this is a discovery feed; duplicate rows would
-- propagate downstream. Presentation-only, layered on top of the
-- marketplace/both filter below, never a substitute for it. Fleet-fit is
-- intentionally NOT computed here: it's a client-side ranking/presentation
-- concern (see isLoadCompatibleWithFleet), not an eligibility filter — a
-- non-fitting load must still be returned.
--
-- client_price is deliberately excluded, same as the driver-side RPC:
-- Network/relationship discovery (market_indents_for_org) may expose more
-- commercial context under an existing relationship; open Marketplace
-- discovery exposes only Marketplace-safe commercial information
-- (supplier_target, aliased rate_offer below) — an unrelated business
-- should not automatically see the shipper's client-side price.

CREATE OR REPLACE FUNCTION public.list_open_marketplace_loads_for_org(
  p_org_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  indent_number text,
  pickup_area text,
  drop_location text,
  vehicle_type text,
  load_type text,
  pickup_date date,
  status text,
  circulation_target text,
  rate_offer numeric,
  creator_organization_id uuid,
  creator_organization_name text,
  created_at timestamptz,
  is_sponsored boolean,
  reach_campaign_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.indent_number,
    i.pickup_area,
    i.drop_location,
    i.vehicle_type,
    i.load_type,
    i.pickup_date,
    i.status::text,
    i.circulation_target::text,
    -- Commercial offer for the supply side (never client_price / client PII).
    i.supplier_target::numeric AS rate_offer,
    i.organization_id AS creator_organization_id,
    o.name AS creator_organization_name,
    i.created_at,
    (rc.id IS NOT NULL) AS is_sponsored,
    rc.id AS reach_campaign_id
  FROM public.indents i
  LEFT JOIN public.organizations o ON o.id = i.organization_id
  LEFT JOIN LATERAL (
    SELECT c.id
    FROM public.reach_campaigns c
    JOIN public.reach_campaign_targets t ON t.campaign_id = c.id
    WHERE t.org_id = p_org_id
      AND t.released_at IS NOT NULL
      AND c.archived_at IS NULL
      AND c.status = 'active'
      AND (c.expires_at IS NULL OR c.expires_at > now())
      AND (
        c.snapshot_source_indent_id = i.id
        OR c.post_id IN (
          SELECT p.id FROM public.posts p WHERE p.source_indent_id = i.id
        )
      )
    ORDER BY c.created_at DESC
    LIMIT 1
  ) rc ON true
  WHERE i.deleted_at IS NULL
    AND i.organization_id <> p_org_id
    AND public.indent_open_for_marketplace_bids(i.id)
    AND lower(trim(coalesce(i.circulation_target, ''))) IN ('marketplace', 'both')
  ORDER BY (rc.id IS NOT NULL) DESC NULLS LAST, i.created_at DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_open_marketplace_loads_for_org(uuid, integer) IS
  'A4.1: read-only open Marketplace/both indents visible to any member of p_org_id, excluding the org''s own indents. Discovery only -- membership-gated, not a bid-eligibility check (see docs/MARKETPLACE_DOMAIN.md "Distribution vs monetization"). is_sponsored/reach_campaign_id reflect whether p_org_id is itself an active, released Reach target for that indent (same join as market_indents_for_org''s via_reach), never a global "this post has a campaign" flag, and never a second commercial object. client_price is intentionally excluded -- Marketplace-safe commercial info only (rate_offer = supplier_target); relationship-based discovery (market_indents_for_org) remains the path that exposes client_price under an existing relationship.';

REVOKE ALL ON FUNCTION public.list_open_marketplace_loads_for_org(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_open_marketplace_loads_for_org(uuid, integer) TO authenticated;
