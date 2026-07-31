-- Adds structure-specific KYC document types to verification_document_type so
-- register_verification_document accepts partnership_deed / llp_agreement /
-- incorporation_certificate / iec_certificate (client upload path).
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as statements
-- that reference the new labels — keep this migration enum-only.
--
-- Guarded: this migration predates 20261111000000_verification_documents_registry.sql,
-- which is what actually creates the verification_document_type enum. On the
-- environment this was restored from, the type already existed; on a
-- from-scratch replay it doesn't exist yet at this point in history, so skip
-- here and let the later migration create the type with these values included
-- from the start (see that file's enum literal list).
DO $$
BEGIN
  IF to_regtype('public.verification_document_type') IS NOT NULL THEN
    ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'incorporation_certificate';
    ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'partnership_deed';
    ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'llp_agreement';
    ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'iec_certificate';
  END IF;
END $$;
