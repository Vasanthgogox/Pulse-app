-- Driver KYC: clones the existing organization_kyc_documents pattern
-- (20261107070000) for drivers. Identity documents are per-person, not
-- per-org-driver-link, so this is keyed by auth.uid() directly — matching
-- the existing ad hoc storage convention in DriverDocumentsScreen.tsx
-- (driver-documents/{auth.uid()}/{docType}-{timestamp}.ext), which this
-- table now gives a real status lifecycle instead of a user_metadata blob.
--
-- Review is platform-level (Admin Console), not org-level — driver identity
-- documents are reviewed by platform compliance/ops staff, the same posture
-- as organization verification, not by the driver's own fleet owner.

CREATE TABLE IF NOT EXISTS public.driver_kyc_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN (
    'license',
    'aadhaar',
    'pan',
    'selfie',
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_kyc_docs_active_type
  ON public.driver_kyc_documents (driver_user_id, doc_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_kyc_docs_driver
  ON public.driver_kyc_documents (driver_user_id, created_at DESC);

-- Admin queue: pending docs first, oldest first (FIFO review).
CREATE INDEX IF NOT EXISTS idx_driver_kyc_docs_pending_queue
  ON public.driver_kyc_documents (created_at ASC)
  WHERE status = 'pending' AND deleted_at IS NULL;

COMMENT ON TABLE public.driver_kyc_documents IS
  'Per-document driver identity KYC uploads (licence/Aadhaar/PAN/selfie), reviewed via the platform Admin Console verification queue. Same pattern as organization_kyc_documents/client_kyc_documents/supplier_kyc_documents.';

ALTER TABLE public.driver_kyc_documents ENABLE ROW LEVEL SECURITY;

-- Identity: is this the driver's own document, or platform review staff?
DROP POLICY IF EXISTS driver_kyc_documents_select ON public.driver_kyc_documents;
CREATE POLICY driver_kyc_documents_select ON public.driver_kyc_documents
  FOR SELECT TO authenticated
  USING (
    driver_user_id = (SELECT auth.uid())
    OR public.has_platform_permission((SELECT auth.uid()), 'driver_kyc.review')
  );

-- Authority: a driver may only ever upload their own document.
DROP POLICY IF EXISTS driver_kyc_documents_insert ON public.driver_kyc_documents;
CREATE POLICY driver_kyc_documents_insert ON public.driver_kyc_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_user_id = (SELECT auth.uid())
    AND uploaded_by = (SELECT auth.uid())
  );

-- No direct UPDATE policy, deliberately — same posture as reach_referrals
-- ("all WRITES go through SECURITY DEFINER RPCs ... no direct insert/update
-- policies"). A simple `USING (driver_user_id = auth.uid())` UPDATE policy
-- would let a driver set their own status='verified' directly; every status
-- transition (resubmit, approve, reject) must go through one of the three
-- RPCs below instead, each with its own explicit guard.

GRANT SELECT, INSERT ON public.driver_kyc_documents TO authenticated;
GRANT ALL ON public.driver_kyc_documents TO service_role;

-- ── Platform permission (matches the existing verification.approve/review pattern) ──

INSERT INTO public.platform_permissions (key, description)
VALUES
  ('driver_kyc.review', 'Review, approve, or reject driver KYC document submissions')
ON CONFLICT (key) DO NOTHING;

-- super_admin already gets every permission via the blanket cross-join in
-- 20261224000000_platform_iam.sql; control_tower is the existing role for
-- verification-style review work, so it gets this one explicitly too.
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'control_tower' AND p.key = 'driver_kyc.review'
ON CONFLICT DO NOTHING;

-- ── Admin approve / reject RPCs ──
-- Deliberately NOT modeled on platform_approve_verification (which awards
-- Reach credits) — driver KYC has no reward/credit side effect, this is a
-- status change + audit trail only, matching org_kyc_documents' own posture
-- (verified_at/verified_by/rejection_notes ARE the audit trail; no separate
-- audit_log table exists for org KYC either, so none is added here).

CREATE OR REPLACE FUNCTION public.platform_approve_driver_kyc_document(
  p_document_id uuid,
  p_notes       text DEFAULT NULL
)
RETURNS public.driver_kyc_documents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.driver_kyc_documents;
BEGIN
  IF NOT public.has_platform_permission((select auth.uid()), 'driver_kyc.review') THEN
    RAISE EXCEPTION 'unauthorized: driver_kyc.review permission required';
  END IF;

  UPDATE public.driver_kyc_documents
  SET
    status          = 'verified',
    verified_at     = now(),
    verified_by     = (select auth.uid()),
    rejection_notes = p_notes,
    updated_at      = now()
  WHERE id = p_document_id AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_kyc_document_not_found: %', p_document_id;
  END IF;

  -- Audit history: verified_by/verified_at on the row only ever hold the
  -- LATEST decision — a document rejected twice before being verified loses
  -- both prior rejection reasons if that's all we keep. platform_events is
  -- the existing, already-indexed (event_type, org_id) x created_at platform
  -- audit log (see platform_approve_verification for the established
  -- pattern) — append-only, so full history survives regardless of how many
  -- times a document is re-reviewed. This also doubles as the reporting/
  -- analytics substrate (approvals/rejections per day, per reviewer, etc.)
  -- without a new table.
  PERFORM public.emit_platform_event(
    'DriverKycDocumentApproved',
    NULL,
    jsonb_build_object(
      'document_id', v_row.id,
      'driver_user_id', v_row.driver_user_id,
      'doc_type', v_row.doc_type,
      'notes', p_notes
    )
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_approve_driver_kyc_document(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_approve_driver_kyc_document(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_reject_driver_kyc_document(
  p_document_id      uuid,
  p_rejection_reason text
)
RETURNS public.driver_kyc_documents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.driver_kyc_documents;
BEGIN
  IF NOT public.has_platform_permission((select auth.uid()), 'driver_kyc.review') THEN
    RAISE EXCEPTION 'unauthorized: driver_kyc.review permission required';
  END IF;

  IF coalesce(trim(p_rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE public.driver_kyc_documents
  SET
    status          = 'rejected',
    verified_at     = now(),
    verified_by     = (select auth.uid()),
    rejection_notes = p_rejection_reason,
    updated_at      = now()
  WHERE id = p_document_id AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_kyc_document_not_found: %', p_document_id;
  END IF;

  PERFORM public.emit_platform_event(
    'DriverKycDocumentRejected',
    NULL,
    jsonb_build_object(
      'document_id', v_row.id,
      'driver_user_id', v_row.driver_user_id,
      'doc_type', v_row.doc_type,
      'rejection_reason', p_rejection_reason
    )
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_reject_driver_kyc_document(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_reject_driver_kyc_document(uuid, text) TO authenticated;

-- ── Re-upload after rejection ──
-- A driver re-submitting a rejected document resets it to 'pending' rather
-- than staying 'rejected' with a new file underneath it. There is no direct
-- UPDATE policy on this table (see above) — this SECURITY DEFINER function,
-- gated on driver_user_id = auth.uid() inside its own body, is the only way
-- a driver's own write can happen at all, so it can't accidentally (or
-- deliberately) set status='verified' via a raw client update.
-- rejection_notes is cleared here because platform_events (below) now holds
-- the durable history of every past rejection reason — the row only needs
-- to reflect current state, not every past decision.
CREATE OR REPLACE FUNCTION public.driver_resubmit_kyc_document(
  p_document_id   uuid,
  p_storage_path  text,
  p_file_name     text,
  p_mime_type     text,
  p_file_size     bigint DEFAULT NULL
)
RETURNS public.driver_kyc_documents
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.driver_kyc_documents;
BEGIN
  UPDATE public.driver_kyc_documents
  SET
    storage_path    = p_storage_path,
    file_name       = p_file_name,
    mime_type       = p_mime_type,
    file_size_bytes = p_file_size,
    status          = 'pending',
    verified_at     = NULL,
    verified_by     = NULL,
    rejection_notes = NULL,
    updated_at      = now()
  WHERE id = p_document_id
    AND driver_user_id = (select auth.uid())
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_kyc_document_not_found_or_not_owned: %', p_document_id;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_resubmit_kyc_document(uuid, text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_resubmit_kyc_document(uuid, text, text, text, bigint) TO authenticated;

-- ── Complete the audit trail: submissions, not just admin decisions ──
-- Approve/reject emit their own platform_events (above) because they go
-- through RPCs already. The first-ever upload is a plain client INSERT
-- (RLS-permitted, no RPC to hook), so a trigger is the one place that
-- reliably sees every submission regardless of call site — including any
-- future writer nobody remembers to add an emit_platform_event() call to.
CREATE OR REPLACE FUNCTION public.fn_emit_driver_kyc_submitted_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND NEW.status = 'pending' AND OLD.status IN ('rejected', 'expired')) THEN
    PERFORM public.emit_platform_event(
      'DriverKycDocumentSubmitted',
      NULL,
      jsonb_build_object(
        'document_id', NEW.id,
        'driver_user_id', NEW.driver_user_id,
        'doc_type', NEW.doc_type,
        'is_resubmission', TG_OP = 'UPDATE'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_kyc_submitted_event ON public.driver_kyc_documents;
CREATE TRIGGER trg_driver_kyc_submitted_event
  AFTER INSERT OR UPDATE OF status ON public.driver_kyc_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_emit_driver_kyc_submitted_event();

-- Realtime: driver sees Verified/Rejected the moment the admin acts, no
-- polling — same posture as every other realtime surface in this codebase.
-- Uses the standard Supabase Realtime publication, not a new mechanism.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'driver_kyc_documents'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_kyc_documents';
  END IF;
END;
$$;
