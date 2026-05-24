-- Extend get_driver_invites_received to include org owner's avatar for consistent
-- avatar display in the driver app (matching business-app party avatar logic).
DROP FUNCTION IF EXISTS public.get_driver_invites_received();
CREATE OR REPLACE FUNCTION public.get_driver_invites_received()
RETURNS TABLE(
  id uuid,
  from_organization_id uuid,
  to_user_id uuid,
  status text,
  created_at timestamptz,
  responded_at timestamptz,
  responded_by uuid,
  from_org_name text,
  payable_amount numeric,
  commission_percent numeric,
  commission_per_km numeric,
  from_org_avatar_url text,
  from_org_avatar_seed text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    di.id,
    di.from_organization_id,
    di.to_user_id,
    di.status,
    di.created_at,
    di.responded_at,
    di.responded_by,
    coalesce(nullif(trim(di.from_org_name), ''), nullif(trim(o.name), ''), 'Company'),
    di.payable_amount,
    di.commission_percent,
    di.commission_per_km,
    p.avatar_url,
    p.avatar_seed
  FROM public.driver_invites di
  LEFT JOIN public.organizations o ON o.id = di.from_organization_id
  LEFT JOIN public.organization_members om
    ON om.organization_id = di.from_organization_id AND om.role = 'owner'
  LEFT JOIN public.profiles p ON p.id = om.user_id
  WHERE di.to_user_id = auth.uid()
  ORDER BY di.created_at DESC;
$$;
