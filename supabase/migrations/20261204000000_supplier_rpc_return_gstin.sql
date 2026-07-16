-- Fix supplier GST data bug.
--
-- The `suppliers` table has two GST columns: `gst_number` (legacy/stale) and
-- `gstin` (authoritative — the app only ever WRITES `gstin`). The
-- get_suppliers_with_profiles RPC returned `s.gst_number`, so app code reading
-- the RPC result saw the stale column while the SupplierRow type + all writes
-- use `gstin`. This produced blank GST in the UI and — worse — made the
-- "don't overwrite existing GST" guard always fire, silently clobbering saved
-- GST on import/sync.
--
-- Fix: return the authoritative `gstin` column, named `gstin` to match
-- SupplierRow and every write path. Only the GST column changes; all other
-- columns and the avatar-branding logic are preserved verbatim.

-- Renaming a RETURNS TABLE output column changes the function's return type,
-- which CREATE OR REPLACE cannot do (SQLSTATE 42P13) — drop first, then recreate.
DROP FUNCTION IF EXISTS public.get_suppliers_with_profiles(uuid);

CREATE FUNCTION public.get_suppliers_with_profiles(p_org_id uuid)
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
  gstin text,
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
    s.id,
    s.organization_id,
    s.name,
    s.contact,
    s.company_name,
    s.contact_person,
    s.phone,
    s.email,
    s.address,
    s.gstin,
    s.is_active,
    s.is_verified,
    s.created_at,
    s.updated_at,
    s.supplier_type::text,
    s.linked_organization_id,
    -- Prefer the linked org's branding logo; fall back to the owner's
    -- personal profile avatar so unbranded orgs still show a face.
    COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url) AS avatar_url,
    p.avatar_seed
  FROM public.suppliers s
  LEFT JOIN public.organizations o ON o.id = s.linked_organization_id
  LEFT JOIN public.profiles      p ON p.id = o.owner_id
  WHERE s.organization_id = p_org_id
  ORDER BY s.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_suppliers_with_profiles(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_suppliers_with_profiles(uuid) IS
  'Returns suppliers for an org. GST is sourced from suppliers.gstin (authoritative). avatar_url resolves to organizations.logo_url first, then profiles.avatar_url from linked org owner. SECURITY DEFINER.';

-- get_supplier_details had the same stale-column bug on BOTH branches:
--  * the SELECT hydrated v_row from s.gst_number
--  * the integrated branch emitted a `gst_number` JSON key
--  * the non-integrated branch to_jsonb(v_row) inherited the gst_number key
-- Recreate it sourcing s.gstin and emitting a `gstin` key so the returned JSON
-- matches SupplierRow (which uses `gstin`) on both paths.
CREATE OR REPLACE FUNCTION public.get_supplier_details(p_supplier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_row record;
  v_org_name text;
  v_owner_id uuid;
  v_full_name text;
  v_phone text;
  v_email text;
  v_authorized boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.id, s.organization_id, s.name, s.contact, s.company_name, s.contact_person,
         s.phone, s.email, s.address, s.gstin, s.is_active, s.is_verified,
         s.operating_areas, s.vehicle_types, s.supplier_type, s.linked_organization_id,
         s.created_at, s.updated_at
  INTO v_row
  FROM public.suppliers s
  WHERE s.id = p_supplier_id;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Caller must be active member or owner of the supplier's org
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_row.organization_id AND om.user_id = v_uid AND om.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = v_row.organization_id AND o.owner_id = v_uid
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RETURN NULL;
  END IF;

  -- Integrated: merge display from linked org's owner profile
  IF v_row.supplier_type = 'integrated' AND v_row.linked_organization_id IS NOT NULL THEN
    SELECT o.name, o.owner_id INTO v_org_name, v_owner_id
    FROM public.organizations o
    WHERE o.id = v_row.linked_organization_id;

    IF v_owner_id IS NOT NULL THEN
      SELECT trim(coalesce(p.full_name, '')), trim(coalesce(p.phone, '')), trim(coalesce(p.email, ''))
      INTO v_full_name, v_phone, v_email
      FROM public.profiles p
      WHERE p.id = v_owner_id;
    END IF;

    RETURN jsonb_build_object(
      'id', v_row.id,
      'organization_id', v_row.organization_id,
      'name', coalesce(nullif(trim(v_row.name), ''), nullif(trim(v_org_name), ''), v_row.company_name),
      'contact', coalesce(nullif(trim(v_row.contact), ''), v_full_name),
      'company_name', coalesce(nullif(trim(v_row.company_name), ''), nullif(trim(v_org_name), ''), 'Connected'),
      'contact_person', coalesce(nullif(trim(v_row.contact_person), ''), v_full_name),
      'phone', coalesce(nullif(trim(v_row.phone), ''), v_phone),
      'email', coalesce(nullif(trim(v_row.email), ''), v_email),
      'address', v_row.address,
      'gstin', v_row.gstin,
      'is_active', v_row.is_active,
      'is_verified', v_row.is_verified,
      'operating_areas', v_row.operating_areas,
      'vehicle_types', v_row.vehicle_types,
      'supplier_type', v_row.supplier_type,
      'linked_organization_id', v_row.linked_organization_id,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at
    );
  END IF;

  -- Non-integrated: return local row as-is (v_row now carries `gstin`)
  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION public.get_supplier_details(uuid) IS 'Returns supplier row for detail/edit. GST sourced from suppliers.gstin (authoritative) on both integrated and non-integrated paths. When supplier_type=integrated, name/company_name/contact_person/phone/email are COALESCE from linked org owner profile. Caller must be member or owner of supplier.organization_id.';
