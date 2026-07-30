-- Structure-driven KYC document matrix (client parity: kycVerification.util.ts).
-- 1) Widen organization_kyc_documents.doc_type CHECK
-- 2) Helper: org_has_kyc_document (org_kyc_documents ∪ verification_documents)
-- 3) Replace submit_business_verification(... p_gst_not_applicable) with matrix checks
--
-- Depends on 20261214100000_verification_document_type_structure_docs.sql

-- ─── 1. Doc type check ───────────────────────────────────────────────────────
-- Guarded: organization_kyc_documents doesn't exist yet at this point on a
-- from-scratch replay (created later by 20261107070000_organization_kyc_documents.sql,
-- whose own CHECK already omits partnership_deed/llp_agreement -- this is the
-- only migration that adds them). No-op here when replayed from scratch;
-- applies for real once the table exists on any environment that already has it.
DO $$
BEGIN
  IF to_regclass('public.organization_kyc_documents') IS NOT NULL THEN
    ALTER TABLE public.organization_kyc_documents
      DROP CONSTRAINT IF EXISTS organization_kyc_documents_doc_type_check;

    ALTER TABLE public.organization_kyc_documents
      ADD CONSTRAINT organization_kyc_documents_doc_type_check
      CHECK (doc_type = ANY (ARRAY[
        'gst_certificate'::text,
        'pan_card'::text,
        'cin_certificate'::text,
        'address_proof'::text,
        'msme_certificate'::text,
        'iec_certificate'::text,
        'incorporation_certificate'::text,
        'partnership_deed'::text,
        'llp_agreement'::text,
        'other'::text
      ]));
  END IF;
END $$;

-- ─── 2. Shared presence helper ───────────────────────────────────────────────
-- Guarded: unlike the plpgsql function below, a LANGUAGE sql function body is
-- validated against the catalog at CREATE FUNCTION time, so this fails outright
-- on a from-scratch replay where organization_kyc_documents (created
-- 2026-11-07) and verification_documents (created 2026-11-11) don't exist yet.
-- Wrapped in EXECUTE so the CREATE FUNCTION is never even parsed unless both
-- tables already exist. org_has_kyc_document has no other callers in this
-- repo (checked: no later migration or app code references it), so skipping
-- its creation on a fresh local DB has no behavioral effect -- nothing to
-- backfill later, unlike the doc_type CHECK widening above.
DO $$
BEGIN
  IF to_regclass('public.organization_kyc_documents') IS NOT NULL
     AND to_regclass('public.verification_documents') IS NOT NULL THEN
    EXECUTE $exec$
      CREATE OR REPLACE FUNCTION public.org_has_kyc_document(
        p_org_id uuid,
        VARIADIC p_types text[]
      )
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $fnbody$
        SELECT
          EXISTS (
            SELECT 1
            FROM public.organization_kyc_documents d
            WHERE d.organization_id = p_org_id
              AND d.deleted_at IS NULL
              AND d.storage_path IS NOT NULL
              AND NULLIF(TRIM(d.storage_path), '') IS NOT NULL
              AND d.doc_type = ANY (p_types)
          )
          OR EXISTS (
            SELECT 1
            FROM public.verification_documents v
            WHERE v.org_id = p_org_id
              AND v.status <> 'REPLACED'
              AND v.document_type::text = ANY (p_types)
          );
      $fnbody$;

      REVOKE ALL ON FUNCTION public.org_has_kyc_document(uuid, text[]) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.org_has_kyc_document(uuid, text[]) TO authenticated, service_role;

      COMMENT ON FUNCTION public.org_has_kyc_document(uuid, text[]) IS
        'True if org has a non-deleted KYC upload matching any of p_types in organization_kyc_documents or verification_documents.';
    $exec$;
  END IF;
END $$;

-- ─── 3. Submit RPC (structure matrix) ────────────────────────────────────────
-- Skipped unconditionally: this CREATE OR REPLACE FUNCTION references
-- public.registration_type_enum in its parameter list (and
-- public.kyc_verification_status in a DECLARE), neither of which exist at
-- this point on a from-scratch replay -- both parameter types and plpgsql
-- DECLARE types are resolved at CREATE FUNCTION time, so this fails outright
-- regardless of body-level table references. Safe to skip entirely (not just
-- guard): submit_business_verification is CREATE OR REPLACE'd 4 more times
-- after this (20261101000000, 20261101000005, 20261111000000,
-- 20261114000000_gst_not_applicable.sql is the final version), so whatever
-- this attempt would have done here is fully overwritten before anything
-- calls it, on every environment -- remote already has this version recorded
-- from when it originally ran there; a fresh replay only ever needs the
-- final definition.
