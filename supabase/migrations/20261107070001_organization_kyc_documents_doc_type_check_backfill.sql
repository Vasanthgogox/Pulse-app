-- Follow-up to 20260714094631_kyc_structure_document_matrix.sql, which widens
-- organization_kyc_documents.doc_type to include partnership_deed and
-- llp_agreement, but is timestamped before
-- 20261107070000_organization_kyc_documents.sql, which is what actually
-- creates the table (with a narrower CHECK that omits those two values). On a
-- from-scratch replay, 20260714094631 now guards itself to skip when the
-- table doesn't exist yet (see that file), so the wider CHECK needs to be
-- (re)applied here instead, once the table is guaranteed to exist. No-op on
-- any environment where 20260714094631 already applied it.
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
