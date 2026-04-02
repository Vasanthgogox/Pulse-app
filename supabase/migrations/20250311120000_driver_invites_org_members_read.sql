-- Allow org members to read driver_invites sent by their org (from_organization_id).
-- Required so the fleet owner can load payable_amount, commission_percent, commission_per_km
-- in getDriverOffersByOrganization and show fixed salary in the driver monthly statement.
-- Invitee can still read own invites (existing policy); this adds org-side read.

DROP POLICY IF EXISTS "Org members can read invites sent by their org" ON public.driver_invites;
CREATE POLICY "Org members can read invites sent by their org"
  ON public.driver_invites FOR SELECT
  USING (public.is_org_member(from_organization_id));
