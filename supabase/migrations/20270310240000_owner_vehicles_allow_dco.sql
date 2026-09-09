-- DCO-4 UI-enablement gap, found while implementing the DCO user-facing
-- flow: owner_vehicles' only RLS policy requires is_driver_fleet_owner(),
-- unconditionally (see 20270210114000_create_owner_vehicles.sql). An
-- approved DCO who has never separately enabled the unrelated Fleet Owner
-- capability cannot INSERT, SELECT, UPDATE, or DELETE their own vehicle
-- rows -- before any application code runs -- yet submit_market_bid()
-- mandates owner_vehicle_id. Without this fix, a pure DCO (approved, not
-- also Fleet-Owner-enabled) can never place a marketplace bid.
--
-- Not calling is_dco_eligible(uuid) directly in the policy: it deliberately
-- has no EXECUTE grant to authenticated (it takes an arbitrary p_user_id,
-- and granting it would let any signed-in user probe whether an arbitrary
-- other person is an approved DCO -- see 20270310210000's own comment).
-- A policy predicate runs as the querying role, so it needs its own
-- self-scoped, zero-argument wrapper -- mirroring can_review_dco()'s own
-- pattern exactly, just for "is the CURRENT user an eligible DCO" instead
-- of "can the current user review DCO applications."

CREATE OR REPLACE FUNCTION public.is_current_user_dco_eligible()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.is_dco_eligible((select auth.uid()));
$function$;

REVOKE ALL ON FUNCTION public.is_current_user_dco_eligible() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_dco_eligible() TO authenticated;

DROP POLICY IF EXISTS "Fleet owners manage own vehicles" ON public.owner_vehicles;
CREATE POLICY "Fleet owners and DCOs manage own vehicles"
  ON public.owner_vehicles
  FOR ALL
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    AND (
      public.is_driver_fleet_owner((SELECT auth.uid()))
      OR public.is_current_user_dco_eligible()
    )
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    AND (
      public.is_driver_fleet_owner((SELECT auth.uid()))
      OR public.is_current_user_dco_eligible()
    )
  );
