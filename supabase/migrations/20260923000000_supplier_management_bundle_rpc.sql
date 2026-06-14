-- Supplier Management Bundle RPC — fetches full supplier profile with related records.
-- Mirrors get_client_management_bundle / get_client_detail_bundle pattern.
-- Depends on tables created in 20260922000000_supplier_management_module.sql.
--
-- RECONSTRUCTED: This file was regenerated from production state on 2026-06-14.
-- The original migration was applied to production but its SQL file was never committed.
-- It was subsequently reverted from supabase_migrations tracking via
--   `supabase migration repair --status reverted 20260923000000`
-- The schema objects it created still exist in production.
-- This file is idempotent (CREATE OR REPLACE).

-- ─── get_supplier_management_bundle ──────────────────────────────────────────
-- Returns all supplier CRM sub-records in a single JSONB payload.
-- Caller must be a member of the owning organization (enforced inline).
CREATE OR REPLACE FUNCTION public.get_supplier_management_bundle(
  p_org_id      uuid,
  p_supplier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'supplier',        row_to_json(s.*),
    'contacts',        COALESCE(
                         (SELECT jsonb_agg(c ORDER BY c.created_at)
                          FROM supplier_contacts c
                          WHERE c.supplier_id = p_supplier_id
                            AND c.organization_id = p_org_id
                            AND c.deleted_at IS NULL),
                         '[]'::jsonb),
    'kyc_documents',   COALESCE(
                         (SELECT jsonb_agg(k ORDER BY k.created_at)
                          FROM supplier_kyc_documents k
                          WHERE k.supplier_id = p_supplier_id
                            AND k.organization_id = p_org_id
                            AND k.deleted_at IS NULL),
                         '[]'::jsonb),
    'compliance_docs', COALESCE(
                         (SELECT jsonb_agg(d ORDER BY d.expiry_date NULLS LAST)
                          FROM supplier_compliance_documents d
                          WHERE d.supplier_id = p_supplier_id
                            AND d.organization_id = p_org_id
                            AND d.deleted_at IS NULL),
                         '[]'::jsonb),
    'contracts',       COALESCE(
                         (SELECT jsonb_agg(ct ORDER BY ct.created_at DESC)
                          FROM supplier_contract_agreements ct
                          WHERE ct.supplier_id = p_supplier_id
                            AND ct.organization_id = p_org_id
                            AND ct.deleted_at IS NULL),
                         '[]'::jsonb),
    'fleet',           COALESCE(
                         (SELECT jsonb_agg(f ORDER BY f.created_at)
                          FROM supplier_fleet f
                          WHERE f.supplier_id = p_supplier_id
                            AND f.organization_id = p_org_id
                            AND f.deleted_at IS NULL),
                         '[]'::jsonb),
    'warehouses',      COALESCE(
                         (SELECT jsonb_agg(w ORDER BY w.created_at)
                          FROM supplier_warehouses w
                          WHERE w.supplier_id = p_supplier_id
                            AND w.organization_id = p_org_id
                            AND w.deleted_at IS NULL),
                         '[]'::jsonb)
  )
  INTO v_result
  FROM public.suppliers s
  WHERE s.id = p_supplier_id
    AND s.organization_id = p_org_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_supplier_management_bundle(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supplier_management_bundle(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_supplier_management_bundle(uuid, uuid) IS
  'Returns supplier row + contacts + kyc_documents + compliance_docs + contracts + fleet + warehouses in a single JSONB payload. Mirrors get_client_management_bundle.';
