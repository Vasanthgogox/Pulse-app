-- Adds structure-specific KYC document types to verification_document_type so
-- register_verification_document accepts partnership_deed / llp_agreement /
-- incorporation_certificate / iec_certificate (client upload path).
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as statements
-- that reference the new labels — keep this migration enum-only.

ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'incorporation_certificate';
ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'partnership_deed';
ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'llp_agreement';
ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'iec_certificate';
