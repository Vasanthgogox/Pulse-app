-- Adds cin_certificate and msme_certificate to verification_document_type so
-- the optional KYC documents (features/organization/types/organizationKycDocuments.types.ts
-- ORG_KYC_OPTIONAL_DOCUMENTS) can be registered via register_verification_document,
-- matching the mandatory gst_certificate/pan_card/address_proof_* path.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block with other
-- statements that use the new value, so this migration only adds the values;
-- no other DDL here.

ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'cin_certificate';
ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'msme_certificate';
