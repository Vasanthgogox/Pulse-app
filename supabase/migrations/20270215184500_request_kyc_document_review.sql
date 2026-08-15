-- Owner/admin document update: mark the org for admin-console review.
-- submit_business_verification only accepts unverified/rejected. A verified
-- org replacing a KYC file must re-enter pending so the queue picks it up.

CREATE OR REPLACE FUNCTION public.request_kyc_document_review(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role           text;
  v_current_status public.kyc_verification_status;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can request document review.';
  END IF;

  SELECT verification_status
  INTO v_current_status
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Organization not found.';
  END IF;

  IF v_current_status = 'pending' THEN
    RETURN jsonb_build_object('ok', true, 'status', v_current_status);
  END IF;

  UPDATE public.organizations SET
    verification_status = 'pending',
    frozen_at = now(),
    submitted_at = now(),
    kyc_rejected_reason = NULL,
    rejection_reasons = NULL,
    updated_at = now()
  WHERE id = p_org_id;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, auth.uid(), v_current_status, 'pending', 'document_update_resubmit');

  RETURN jsonb_build_object('ok', true, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.request_kyc_document_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_kyc_document_review(uuid) TO authenticated;

COMMENT ON FUNCTION public.request_kyc_document_review(uuid) IS
  'Re-queue org KYC for admin review after a document replace. No-op if already pending.';

-- Document replace must be allowed while pending/verified. The freeze guard
-- blocked organizations.address_proof_path, which the KYC-doc sync trigger
-- writes on every address-proof upsert.
CREATE OR REPLACE FUNCTION public.enforce_verification_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.verification_status IN ('pending', 'verified') THEN
    IF current_setting('role', true) = 'service_role' THEN
      RETURN NEW;
    END IF;

    IF (NEW.business_pan   IS DISTINCT FROM OLD.business_pan   OR
        NEW.gstin          IS DISTINCT FROM OLD.gstin          OR
        NEW.cin            IS DISTINCT FROM OLD.cin            OR
        NEW.registration_type IS DISTINCT FROM OLD.registration_type) THEN
      RAISE EXCEPTION
        'PROFILE_FROZEN: Verification fields are locked while status is %. Contact support.',
        OLD.verification_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
