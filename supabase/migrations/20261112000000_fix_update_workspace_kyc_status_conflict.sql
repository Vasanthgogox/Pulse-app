-- update_workspace_kyc previously auto-flipped verification_status to 'pending'
-- on any PAN/GSTIN/CIN save. That predates the Sprint 1 submit_business_verification
-- flow, which is the actual submission gate (sets frozen_at, queues a verification_job,
-- writes an audit log). The wizard's step-by-step saves call update_workspace_kyc,
-- which was silently moving orgs to 'pending' before the user ever reached the
-- Submit button — locking them out of submit_business_verification (which only
-- accepts 'unverified'/'rejected') with no frozen_at, no job, no audit trail.
-- Fix: update_workspace_kyc only persists fields; status transitions belong
-- exclusively to submit_business_verification.
CREATE OR REPLACE FUNCTION public.update_workspace_kyc(
  p_org_id      uuid,
  p_pan         text DEFAULT NULL,
  p_gstin       text DEFAULT NULL,
  p_cin         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_pan    text := nullif(trim(upper(p_pan)), '');
  v_gstin  text := nullif(trim(upper(p_gstin)), '');
  v_cin    text := nullif(trim(upper(p_cin)), '');
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can update KYC details.';
  END IF;

  IF v_pan IS NOT NULL AND v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
    RAISE EXCEPTION 'Invalid PAN format. Expected 10 characters like ABCDE1234F.';
  END IF;

  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'Invalid GSTIN format. Expected 15-character format.';
  END IF;

  IF v_cin IS NOT NULL AND length(v_cin) != 21 THEN
    RAISE EXCEPTION 'Invalid CIN format. Expected 21 characters.';
  END IF;

  UPDATE public.organizations
  SET
    business_pan = COALESCE(v_pan, business_pan),
    gstin        = COALESCE(v_gstin, gstin),
    cin          = COALESCE(v_cin, cin),
    updated_at   = now()
  WHERE id = p_org_id;

  RETURN (
    SELECT jsonb_build_object(
      'id',                  id,
      'business_pan',        business_pan,
      'gstin',               gstin,
      'cin',                 cin,
      'verification_status', verification_status,
      'verified_at',         verified_at
    )
    FROM public.organizations WHERE id = p_org_id
  );
END;
$$;
