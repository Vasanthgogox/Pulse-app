-- Driver dossier showed "Not available" for mail when drivers.email was null but
-- public.profiles.email (same user_id) was set at signup. List + detail now coalesce.

CREATE OR REPLACE FUNCTION public.get_drivers_with_profiles(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  user_id uuid,
  name text,
  phone text,
  email text,
  status text,
  assigned_vehicle_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  left_at timestamptz,
  tracking_only boolean,
  payable_amount numeric,
  commission_percent numeric,
  commission_per_km numeric,
  avatar_url text,
  avatar_seed text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.organization_id,
    d.user_id,
    d.name,
    d.phone,
    COALESCE(
      NULLIF(BTRIM(COALESCE(d.email, '')::text), ''),
      NULLIF(BTRIM(COALESCE(p.email, '')::text), '')
    ) AS email,
    d.status,
    d.assigned_vehicle_id,
    d.created_at,
    d.updated_at,
    d.left_at,
    d.tracking_only,
    d.payable_amount,
    d.commission_percent,
    d.commission_per_km,
    p.avatar_url,
    p.avatar_seed
  FROM public.drivers d
  LEFT JOIN public.profiles p ON p.id = d.user_id
  WHERE d.organization_id = p_org_id
  ORDER BY d.created_at DESC;
END;
$$;

-- Single-driver fetch: used when drivers.email is empty (getDriverById merge).
CREATE OR REPLACE FUNCTION public.get_driver_coalesced_email_for_org(
  p_org_id uuid,
  p_driver_id uuid
)
RETURNS TABLE (email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(
      NULLIF(BTRIM(COALESCE(d.email, '')::text), ''),
      NULLIF(BTRIM(COALESCE(p.email, '')::text), '')
    )::text AS email
  FROM public.drivers d
  LEFT JOIN public.profiles p ON p.id = d.user_id
  WHERE d.organization_id = p_org_id
    AND d.id = p_driver_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_drivers_with_profiles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_coalesced_email_for_org(uuid, uuid) TO authenticated;
