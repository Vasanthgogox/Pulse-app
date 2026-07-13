-- Workspace KYC documents — per-document uploads for verification admin review.
-- Storage: verification-documents bucket (org_id/doc_type-timestamp.ext).

CREATE TABLE IF NOT EXISTS public.organization_kyc_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN (
    'gst_certificate',
    'pan_card',
    'cin_certificate',
    'address_proof',
    'msme_certificate',
    'iec_certificate',
    'incorporation_certificate',
    'other'
  )),
  doc_label        text,
  storage_path     text,
  file_name        text,
  mime_type        text,
  file_size_bytes  bigint,
  is_mandatory     boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected', 'expired')),
  verified_at      timestamptz,
  verified_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_notes  text,
  uploaded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_kyc_docs_active_type
  ON public.organization_kyc_documents (organization_id, doc_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_kyc_docs_org
  ON public.organization_kyc_documents (organization_id, created_at DESC);

COMMENT ON TABLE public.organization_kyc_documents IS
  'Per-document KYC uploads for workspace verification; surfaced in verification admin console.';

ALTER TABLE public.organization_kyc_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_kyc_documents_select ON public.organization_kyc_documents;
CREATE POLICY org_kyc_documents_select ON public.organization_kyc_documents
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS org_kyc_documents_insert ON public.organization_kyc_documents;
CREATE POLICY org_kyc_documents_insert ON public.organization_kyc_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND uploaded_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS org_kyc_documents_update ON public.organization_kyc_documents;
CREATE POLICY org_kyc_documents_update ON public.organization_kyc_documents
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE ON public.organization_kyc_documents TO authenticated;
GRANT ALL ON public.organization_kyc_documents TO service_role;

-- Keep organizations.address_proof_path in sync when address_proof document is upserted.
CREATE OR REPLACE FUNCTION public.sync_org_address_proof_from_kyc_doc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.doc_type = 'address_proof' AND NEW.deleted_at IS NULL THEN
    UPDATE public.organizations
    SET
      address_proof_path = NULLIF(TRIM(NEW.storage_path), ''),
      updated_at = now()
    WHERE id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_org_address_proof_from_kyc_doc ON public.organization_kyc_documents;
CREATE TRIGGER trg_sync_org_address_proof_from_kyc_doc
  AFTER INSERT OR UPDATE OF storage_path, deleted_at ON public.organization_kyc_documents
  FOR EACH ROW
  WHEN (NEW.doc_type = 'address_proof')
  EXECUTE FUNCTION public.sync_org_address_proof_from_kyc_doc();
