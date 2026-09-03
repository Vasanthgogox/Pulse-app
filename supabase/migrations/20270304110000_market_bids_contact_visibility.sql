-- A4.4 Phase 4 -- Marketplace bid contact visibility (Business Review Hub).
--
-- list_market_bids_for_indent previously returned no phone at all (not
-- masked -- simply absent) and no organization identity for
-- bidder_type='organization' rows (label fell through to the DCO
-- "Driver ({name})" branch). This adds both, backend-enforced per the
-- locked contact-visibility policy: the RPC itself returns only a masked
-- phone before award, and the real phone only once the bid is 'accepted' --
-- the client never receives an unmasked value it would have to mask itself.
--
-- Phone source:
--   - bidder_type = 'dco'          -> profiles.phone via bidder_user_id
--   - bidder_type = 'organization' -> profiles.phone via the bidder
--     organization's owner_id, the same org-contact convention already
--     used by connection_requests approval reveal (organizations has no
--     phone column of its own).
--
-- Same authorization check as before (caller must be a non-driver active
-- member of the organization that owns the indent) -- read-only projection,
-- no table/RLS changes.
--
-- New output columns change the function's RETURNS TABLE composite shape,
-- which CREATE OR REPLACE cannot do in place (Postgres error 42P13:
-- "cannot change return type of existing function" -- confirmed against the
-- linked remote DB before adding this DROP). Drop and recreate instead.

DROP FUNCTION IF EXISTS public.list_market_bids_for_indent(uuid);

CREATE FUNCTION public.list_market_bids_for_indent(p_indent_id uuid)
RETURNS TABLE (
  id                      uuid,
  indent_id               uuid,
  bidder_type             text,
  bidder_user_id          uuid,
  bidder_display_name     text,
  bidder_organization_id  uuid,
  bidder_organization_name text,
  bidder_masked_phone     text,
  bidder_phone            text,
  is_fleet_owner          boolean,
  amount                  numeric,
  note                    text,
  status                  text,
  created_at              timestamptz,
  updated_at              timestamptz,
  accepted_at             timestamptz,
  vehicle_number          text,
  vehicle_brand           text,
  vehicle_model           text,
  vehicle_body_type       text,
  vehicle_capacity        text
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
    mb.bidder_organization_id,
    bo.name AS bidder_organization_name,
    public.mask_phone_last4(
      CASE WHEN mb.bidder_type = 'organization' THEN bowner_pr.phone ELSE pr.phone END
    ) AS bidder_masked_phone,
    CASE
      WHEN mb.status = 'accepted' THEN
        CASE WHEN mb.bidder_type = 'organization' THEN bowner_pr.phone ELSE pr.phone END
      ELSE NULL
    END AS bidder_phone,
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
  LEFT JOIN public.organizations bo ON bo.id = mb.bidder_organization_id
  LEFT JOIN public.profiles bowner_pr ON bowner_pr.id = bo.owner_id
  WHERE mb.indent_id = p_indent_id
  ORDER BY mb.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_market_bids_for_indent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_market_bids_for_indent(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_market_bids_for_indent(uuid) IS
  'Business Review Hub: list market_bids on one indent with bidder display name/org identity/fleet-owner flag/vehicle details, for org members who own the indent. bidder_masked_phone is always populated; bidder_phone is NULL unless the bid is accepted -- Marketplace contact-visibility policy enforced server-side (see docs/MARKETPLACE_DOMAIN.md). Read-only projection behind the same organization-membership check accept_market_bid() uses.';
