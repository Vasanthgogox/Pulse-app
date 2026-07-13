-- Simplified and robust RPCs for fetching network nodes with profiles (SECURITY DEFINER).
-- Using LEFT JOIN to ensure no data is lost if profile is missing.

-- 1. Clients with Profiles
CREATE OR REPLACE FUNCTION public.get_clients_with_profiles(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  name text,
  contact_person text,
  phone text,
  email text,
  address text,
  gstin text,
  pan_number text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  is_integrated boolean,
  linked_organization_id uuid,
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
    c.id, c.organization_id, c.name, c.contact_person, c.phone, c.email, c.address, c.gstin, c.pan_number, 
    c.status, c.created_at, c.updated_at, c.is_integrated, c.linked_organization_id,
    p.avatar_url, p.avatar_seed
  FROM public.clients c
  LEFT JOIN public.organizations o ON o.id = c.linked_organization_id
  LEFT JOIN public.profiles p ON p.id = o.owner_id
  WHERE c.organization_id = p_org_id AND c.status = 'active'
  ORDER BY c.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clients_with_profiles(uuid) TO authenticated;

-- 2. Suppliers with Profiles
CREATE OR REPLACE FUNCTION public.get_suppliers_with_profiles(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  name text,
  contact text,
  company_name text,
  contact_person text,
  phone text,
  email text,
  address text,
  gst_number text,
  is_active boolean,
  is_verified boolean,
  created_at timestamptz,
  updated_at timestamptz,
  supplier_type text,
  linked_organization_id uuid,
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
    s.id, s.organization_id, s.name, s.contact, s.company_name, s.contact_person, s.phone, s.email, s.address, s.gst_number,
    s.is_active, s.is_verified, s.created_at, s.updated_at, s.supplier_type::text, s.linked_organization_id,
    p.avatar_url, p.avatar_seed
  FROM public.suppliers s
  LEFT JOIN public.organizations o ON o.id = s.linked_organization_id
  LEFT JOIN public.profiles p ON p.id = o.owner_id
  WHERE s.organization_id = p_org_id
  ORDER BY s.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_suppliers_with_profiles(uuid) TO authenticated;

-- 3. Drivers with Profiles
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
    d.id, d.organization_id, d.user_id, d.name, d.phone, d.email, d.status, d.assigned_vehicle_id,
    d.created_at, d.updated_at, d.left_at, d.tracking_only, d.payable_amount, d.commission_percent, d.commission_per_km,
    p.avatar_url, p.avatar_seed
  FROM public.drivers d
  LEFT JOIN public.profiles p ON p.id = d.user_id
  WHERE d.organization_id = p_org_id
  ORDER BY d.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_drivers_with_profiles(uuid) TO authenticated;
