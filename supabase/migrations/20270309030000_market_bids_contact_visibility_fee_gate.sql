-- A8.6.2 — fix the Marketplace contact-reveal gate to require the platform
-- fee be paid (or never required), not just an 'accepted' award status.
--
-- Fixes the pre-existing organization-bidder leak found in A8.6: an
-- organization's accepted-but-unallocated award revealed the real phone
-- immediately, with no trip/relationship gate at all. Under the frozen
-- A8.6.1 design this also correctly withholds the phone for a DCO or
-- organization bidder who has been awarded but not yet paid the fee.
--
-- Both functions need DROP + CREATE (not CREATE OR REPLACE) because their
-- RETURNS TABLE shape gains two columns -- Postgres 42P13, same constraint
-- the original 20270304110000/20270304120000 migrations already worked
-- around. Bodies below are re-fetched fresh from the live database this
-- session (not a reconstruction) with exactly two changes each: the two
-- new output columns, and the phone-reveal CASE predicate. Organization/
-- display name visibility is untouched by design.

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
  fee_payment_status      text,
  platform_fee_amount     numeric,
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
SET search_path TO ''
AS $function$
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
    -- CHANGED (A8.6.2): was `mb.status = 'accepted'`. An accepted-but-unpaid
    -- award (any bidder type once a fee is ever active; organization
    -- awards specifically today, since they can sit accepted-with-no-trip
    -- indefinitely) no longer reveals the real phone.
    CASE
      WHEN mb.status = 'accepted' AND mb.fee_payment_status IN ('paid', 'not_required') THEN
        CASE WHEN mb.bidder_type = 'organization' THEN bowner_pr.phone ELSE pr.phone END
      ELSE NULL
    END AS bidder_phone,
    public.is_driver_fleet_owner(mb.bidder_user_id) AS is_fleet_owner,
    mb.amount,
    mb.note,
    mb.status,
    mb.fee_payment_status,
    mb.platform_fee_amount,
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
$function$;

REVOKE ALL ON FUNCTION public.list_market_bids_for_indent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_market_bids_for_indent(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_market_bids_for_indent(uuid) IS
  'Business Review Hub: list market_bids on one indent. bidder_phone now requires status=accepted AND fee_payment_status IN (paid, not_required) -- A8.6.2 fix for the pre-existing organization-bidder contact leak (accepted-but-unpaid/unallocated award previously revealed the phone immediately). Organization/display name visibility is unaffected -- unchanged by design.';

DROP FUNCTION IF EXISTS public.list_my_org_market_bids(uuid, integer);

CREATE FUNCTION public.list_my_org_market_bids(
  p_org_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id                      uuid,
  indent_id               uuid,
  indent_number           text,
  pickup_area             text,
  drop_location           text,
  pickup_date             date,
  load_type               text,
  owner_organization_id   uuid,
  owner_organization_name text,
  owner_masked_phone      text,
  owner_phone             text,
  amount                  numeric,
  note                    text,
  status                  text,
  fee_payment_status      text,
  platform_fee_amount     numeric,
  created_at              timestamptz,
  accepted_at             timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
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
    mb.id,
    mb.indent_id,
    i.indent_number,
    i.pickup_area,
    i.drop_location,
    i.pickup_date,
    i.load_type,
    i.organization_id AS owner_organization_id,
    o.name AS owner_organization_name,
    public.mask_phone_last4(owner_pr.phone) AS owner_masked_phone,
    -- CHANGED (A8.6.2): was `mb.status = 'accepted'`.
    CASE WHEN mb.status = 'accepted' AND mb.fee_payment_status IN ('paid', 'not_required')
      THEN owner_pr.phone ELSE NULL END AS owner_phone,
    mb.amount,
    mb.note,
    mb.status,
    mb.fee_payment_status,
    mb.platform_fee_amount,
    mb.created_at,
    mb.accepted_at
  FROM public.market_bids mb
  JOIN public.indents i ON i.id = mb.indent_id
  LEFT JOIN public.organizations o ON o.id = i.organization_id
  LEFT JOIN public.profiles owner_pr ON owner_pr.id = o.owner_id
  WHERE mb.bidder_type = 'organization'
    AND mb.bidder_organization_id = p_org_id
  ORDER BY mb.created_at DESC
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_org_market_bids(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_org_market_bids(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.list_my_org_market_bids(uuid, integer) IS
  'Organization bidder''s own Marketplace bids ("My Bids"). owner_phone now requires status=accepted AND fee_payment_status IN (paid, not_required) -- A8.6.2 fix for the pre-existing contact leak (an accepted-but-unallocated award previously revealed the load owner''s phone immediately, with no trip/payment gate at all).';
