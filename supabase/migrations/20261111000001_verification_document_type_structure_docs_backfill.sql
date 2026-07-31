-- Follow-up to 20260714094613_verification_document_type_structure_docs.sql.
-- That migration adds structure-specific KYC document types (partnership_deed
-- / llp_agreement / incorporation_certificate / iec_certificate) to
-- verification_document_type, but is timestamped before
-- 20261111000000_verification_documents_registry.sql, which is what actually
-- creates that enum (and doesn't include these 4 values). On a from-scratch
-- replay, 20260714094613 now guards itself to skip when the type doesn't
-- exist yet (see that file), so these values need to be added here instead,
-- once the type is guaranteed to exist. No-op on any environment where
-- 20260714094613 already added them.
DO $$
BEGIN
  IF to_regtype('public.verification_document_type') IS NOT NULL THEN
    ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'incorporation_certificate';
    ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'partnership_deed';
    ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'llp_agreement';
    ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'iec_certificate';
  END IF;
END $$;
