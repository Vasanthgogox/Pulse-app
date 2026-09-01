-- Business Review Hub v1 for Market bids (DCO bids directly on an indent).
--
-- market_bids RLS already lets an active org member of the indent's
-- organization SELECT the bid rows themselves (market_bids_select policy),
-- but the vehicle details worth showing on a bid card live on
-- owner_vehicles, which is locked to the vehicle's own fleet-owner
-- ("Fleet owners manage own vehicles": owner_user_id = auth.uid()) --
-- a business org member cannot read another user's owner_vehicles row
-- directly. Same shape of problem list_driver_direct_bids_for_post solved
-- for Reach bidder avatars; same fix here: one SECURITY DEFINER RPC that
-- re-checks the caller's own org membership, then reads across both
-- driver-owned tables to assemble one display row.
--
-- No table changes, no RLS changes on market_bids/owner_vehicles/profiles --
-- this is a read-only projection behind the same authorization check
-- accept_market_bid() already uses.

CREATE OR REPLACE FUNCTION public.list_market_bids_for_indent(p_indent_id uuid)
RETURNS TABLE (
  id                  uuid,
  indent_id           uuid,
  bidder_type         text,
  bidder_user_id      uuid,
  bidder_display_name text,
  is_fleet_owner      boolean,
  amount              numeric,
  note                text,
  status              text,
  created_at          timestamptz,
  updated_at          timestamptz,
  accepted_at         timestamptz,
  vehicle_number      text,
  vehicle_brand       text,
  vehicle_model       text,
  vehicle_body_type   text,
  vehicle_capacity    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT i.organization_id INTO v_org_id
  FROM public.indents i
  WHERE i.id = p_indent_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'not_found: indent %', p_indent_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_org_id
      AND om.user_id = v_uid
      AND om.status = 'active'
      AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the organization that owns this indent';
  END IF;

  RETURN QUERY
  SELECT
    mb.id,
    mb.indent_id,
    mb.bidder_type,
    mb.bidder_user_id,
    COALESCE(NULLIF(TRIM(pr.full_name), ''), 'Driver') AS bidder_display_name,
    public.is_driver_fleet_owner(mb.bidder_user_id) AS is_fleet_owner,
    mb.amount,
    mb.note,
    mb.status,
    mb.created_at,
    mb.updated_at,
    mb.accepted_at,
    ov.vehicle_number,
    ov.vehicle_brand,
    ov.vehicle_model,
    ov.vehicle_body_type,
    ov.capacity
  FROM public.market_bids mb
  LEFT JOIN public.profiles pr ON pr.id = mb.bidder_user_id
  LEFT JOIN public.owner_vehicles ov ON ov.id = mb.owner_vehicle_id
  WHERE mb.indent_id = p_indent_id
  ORDER BY mb.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_market_bids_for_indent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_market_bids_for_indent(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_market_bids_for_indent(uuid) IS
  'Business Review Hub: list market_bids on one indent with bidder display name/fleet-owner flag and vehicle details, for org members who own the indent. Read-only projection behind the same organization-membership check accept_market_bid() uses.';
