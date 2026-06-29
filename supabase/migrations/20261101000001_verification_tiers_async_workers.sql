-- =============================================================================
-- Verification Tiers & Async Worker Queue
-- =============================================================================
-- Naming conventions adopted from product spec:
--   • Enums use SCREAMING_SNAKE for clarity in admin tooling and logs
--   • verification_jobs uses organization_id (aligns with organization_members FK pattern)
--   • Pillar columns carry semantic suffixes: pillar_1_tax_status, pillar_2_mca_status
--   • error_logs TEXT[] retains full per-attempt error history
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Core Enums
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.verification_tier_enum AS ENUM (
    'TIER_0_SANDBOX',  -- phone-verified, explore-only
    'TIER_1_PARTIAL',  -- OCR + tax passed; ₹2L cap
    'TIER_2_FULL'      -- penny-drop + biometric + admin; unlimited GTV
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_job_status AS ENUM (
    'QUEUED',         -- written on submission, waiting for worker
    'PROCESSING',     -- worker invocation in flight
    'COMPLETED',      -- all automated pillars resolved
    'PARTIAL_REVIEW', -- ≥1 pillar routed to manual desk
    'FAILED'          -- max retries (4) exhausted
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pillar_status_type AS ENUM (
    'NOT_STARTED',    -- user action required (pillars 3 & 4)
    'QUEUED',         -- scheduled for automated check
    'PROCESSING',     -- check in flight
    'PASSED',
    'MANUAL_REVIEW',  -- routed to admin exception desk
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Extend organizations with tier-tracking columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS verification_tier       public.verification_tier_enum NOT NULL DEFAULT 'TIER_0_SANDBOX',
  ADD COLUMN IF NOT EXISTS tier_1_unlocked_at      timestamptz,
  ADD COLUMN IF NOT EXISTS tier_2_unlocked_at      timestamptz,
  -- 0 = locked (Tier 0). 20000000 paise = ₹2,00,000 (Tier 1). NULL = unlimited (Tier 2).
  ADD COLUMN IF NOT EXISTS transaction_cap_paise   bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS penny_drop_status       public.pillar_status_type NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS penny_drop_detail       jsonb,
  ADD COLUMN IF NOT EXISTS biometric_status        public.pillar_status_type NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS biometric_detail        jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: verification_jobs — persistent async worker queue
-- One row per org; upserted on each resubmission so partial progress resets.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.verification_jobs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK uses organization_id to match organization_members convention
  organization_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  status                public.verification_job_status NOT NULL DEFAULT 'QUEUED',

  -- OCR congruence: cheapest gate, runs before any paid registry call
  ocr_status            public.pillar_status_type NOT NULL DEFAULT 'QUEUED',
  ocr_detail            jsonb,

  -- Pillar 1: GSTIN + PAN statutory registry (HyperVerge / Signzy)
  pillar_1_tax_status   public.pillar_status_type NOT NULL DEFAULT 'QUEUED',
  pillar_1_tax_detail   jsonb,

  -- Pillar 2: MCA corporate structure (LLP / Pvt Ltd / Public Ltd only)
  pillar_2_mca_status   public.pillar_status_type NOT NULL DEFAULT 'NOT_STARTED',
  pillar_2_mca_detail   jsonb,

  -- Pillars 3 & 4 are user-triggered; tracked on organizations, not here

  -- Worker bookkeeping
  attempts              int         NOT NULL DEFAULT 0,
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  error_logs            text[],     -- one entry per failed attempt
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_verification_job_org UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_vjobs_dispatch
  ON public.verification_jobs(status, next_attempt_at)
  WHERE status IN ('QUEUED', 'PARTIAL_REVIEW');

-- RLS: orgs read their own job; workers run under service_role (bypasses RLS)
ALTER TABLE public.verification_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to view their own organization's verification jobs"
  ON public.verification_jobs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: submit_business_verification — updated for new column names
-- Replaces the version created in migration 20261101000000.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_business_verification(
  p_org_id             uuid,
  p_registration_type  public.registration_type_enum DEFAULT NULL,
  p_address_pincode    text    DEFAULT NULL,
  p_address_proof_path text    DEFAULT NULL,
  p_address_proof_type text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role            text;
  v_current_status  public.kyc_verification_status;
  v_reg_type        public.registration_type_enum;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can submit for verification.';
  END IF;

  SELECT verification_status, registration_type
  INTO v_current_status, v_reg_type
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status NOT IN ('unverified', 'rejected') THEN
    RAISE EXCEPTION 'Profile is already % and cannot be resubmitted.', v_current_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND business_pan IS NOT NULL AND gstin IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAN and GSTIN must be saved before submitting.';
  END IF;

  UPDATE public.organizations SET
    registration_type   = COALESCE(p_registration_type,  registration_type),
    address_pincode     = COALESCE(NULLIF(TRIM(p_address_pincode), ''),   address_pincode),
    address_proof_path  = COALESCE(NULLIF(TRIM(p_address_proof_path), ''), address_proof_path),
    address_proof_type  = COALESCE(NULLIF(TRIM(p_address_proof_type), ''), address_proof_type),
    verification_status = 'pending',
    frozen_at           = now(),
    submitted_at        = now(),
    rejection_reasons   = NULL,
    updated_at          = now()
  WHERE id = p_org_id;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, auth.uid(), v_current_status, 'pending', 'user_submitted');

  -- Determine whether MCA check applies based on registration type
  v_reg_type := COALESCE(p_registration_type, v_reg_type);

  INSERT INTO public.verification_jobs (organization_id, status, pillar_2_mca_status)
  VALUES (
    p_org_id,
    'QUEUED',
    CASE WHEN v_reg_type IN ('llp', 'pvt_ltd', 'public_ltd', 'partnership')
         THEN 'QUEUED' ELSE 'NOT_STARTED' END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    status              = 'QUEUED',
    ocr_status          = 'QUEUED',
    pillar_1_tax_status = 'QUEUED',
    pillar_2_mca_status = EXCLUDED.pillar_2_mca_status,
    ocr_detail          = NULL,
    pillar_1_tax_detail = NULL,
    pillar_2_mca_detail = NULL,
    attempts            = 0,
    error_logs          = NULL,
    next_attempt_at     = now(),
    completed_at        = NULL,
    updated_at          = now();

  RETURN jsonb_build_object(
    'ok',                  true,
    'org_id',              p_org_id,
    'verification_status', 'pending',
    'frozen_at',           now(),
    'job_queued',          true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_business_verification(
  uuid, public.registration_type_enum, text, text, text
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Tier upgrade trigger — fires after verification_jobs UPDATE
-- Queries organizations separately for current tier (avoids the OLD.verification_tier
-- bug that would arise if comparing against a column that only lives on organizations).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_tier_upgrades_and_caps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_tier public.verification_tier_enum;
BEGIN
  -- Fetch the org's current tier from organizations (not from the job row)
  SELECT verification_tier INTO v_current_tier
  FROM public.organizations WHERE id = NEW.organization_id;

  -- ── Tier 1 Transition ─────────────────────────────────────────────────────
  -- Rule: OCR and Tax registry both passed; org is still at sandbox tier
  IF NEW.ocr_status          = 'PASSED'
  AND NEW.pillar_1_tax_status = 'PASSED'
  AND v_current_tier          = 'TIER_0_SANDBOX'
  AND (OLD.ocr_status != 'PASSED' OR OLD.pillar_1_tax_status != 'PASSED')
  THEN
    UPDATE public.organizations SET
      verification_tier    = 'TIER_1_PARTIAL',
      tier_1_unlocked_at   = now(),
      transaction_cap_paise = 20000000,   -- ₹2,00,000
      updated_at           = now()
    WHERE id = NEW.organization_id;

    INSERT INTO public.verification_audit_logs
      (org_id, changed_by, previous_status, new_status, notes)
    VALUES
      (NEW.organization_id, NULL, 'pending', 'pending',
       'System-automated progression to Tier 1: OCR and Tax Registry matches complete.');
  END IF;

  -- ── Tier 2 Notification ───────────────────────────────────────────────────
  -- Rule: all automated pillars cleared; flag for admin to finalise after
  -- penny-drop + biometric are also completed by the user
  IF NEW.ocr_status          = 'PASSED'
  AND NEW.pillar_1_tax_status = 'PASSED'
  AND NEW.pillar_2_mca_status IN ('PASSED', 'NOT_STARTED')
  AND NEW.status              = 'COMPLETED'
  AND v_current_tier          = 'TIER_1_PARTIAL'
  THEN
    INSERT INTO public.verification_audit_logs
      (org_id, changed_by, previous_status, new_status, notes)
    VALUES
      (NEW.organization_id, NULL, 'pending', 'pending',
       'System: Pillars 1 and 2 cleared by automated worker. Awaiting user bank and biometric verification for Tier 2.');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tier_upgrade ON public.verification_jobs;
CREATE TRIGGER trg_tier_upgrade
  AFTER UPDATE ON public.verification_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.process_tier_upgrades_and_caps();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: get_verification_job_status RPC — updated for new column names
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_verification_job_status(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'job_id',               j.id,
    'status',               j.status,
    'ocr_status',           j.ocr_status,
    'ocr_detail',           j.ocr_detail,
    'pillar_1_tax_status',  j.pillar_1_tax_status,
    'pillar_1_tax_detail',  j.pillar_1_tax_detail,
    'pillar_2_mca_status',  j.pillar_2_mca_status,
    'pillar_2_mca_detail',  j.pillar_2_mca_detail,
    'verification_tier',    o.verification_tier,
    'transaction_cap_paise', o.transaction_cap_paise,
    'penny_drop_status',    o.penny_drop_status,
    'biometric_status',     o.biometric_status,
    'completed_at',         j.completed_at,
    'attempts',             j.attempts
  )
  FROM public.verification_jobs j
  JOIN public.organizations o ON o.id = j.organization_id
  JOIN public.organization_members om
    ON om.organization_id = j.organization_id
   AND om.user_id = auth.uid()
   AND om.status  = 'active'
  WHERE j.organization_id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_verification_job_status(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: get_tier_capabilities RPC — updated for new enum values
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tier_capabilities(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE o.verification_tier
    WHEN 'TIER_0_SANDBOX' THEN jsonb_build_object(
      'tier',               'TIER_0_SANDBOX',
      'label',              'Sandbox Access',
      'can_bid',            false,
      'can_post_trips',     false,
      'can_join_matching',  false,
      'can_clear_escrow',   false,
      'transaction_cap',    0,
      'description', 'Explore the platform. Complete business verification to unlock marketplace access.'
    )
    WHEN 'TIER_1_PARTIAL' THEN jsonb_build_object(
      'tier',               'TIER_1_PARTIAL',
      'label',              'Partial Activation',
      'can_bid',            true,
      'can_post_trips',     true,
      'can_join_matching',  true,
      'can_clear_escrow',   false,
      'transaction_cap',    20000000,
      'description', 'Basic marketplace access up to ₹2,00,000 GTV. Complete bank and biometric verification to unlock full access.'
    )
    WHEN 'TIER_2_FULL' THEN jsonb_build_object(
      'tier',               'TIER_2_FULL',
      'label',              'Full Marketplace Activation',
      'can_bid',            true,
      'can_post_trips',     true,
      'can_join_matching',  true,
      'can_clear_escrow',   true,
      'transaction_cap',    null,
      'description', 'Unlimited enterprise GTV. Full escrow and referral payouts enabled.'
    )
  END
  FROM public.organizations o
  JOIN public.organization_members om
    ON om.organization_id = o.id
   AND om.user_id = auth.uid()
   AND om.status  = 'active'
  WHERE o.id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_tier_capabilities(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: pg_cron dispatch — every 60 seconds, pick up QUEUED jobs
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
  THEN
    BEGIN PERFORM cron.unschedule('dispatch_verification_workers');
    EXCEPTION WHEN others THEN NULL; END;

    PERFORM cron.schedule(
      'dispatch_verification_workers',
      '* * * * *',
      $$
        SELECT net.http_post(
          url     := current_setting('app.supabase_url', true)
                     || '/functions/v1/verification-worker',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
          ),
          body    := jsonb_build_object('job_id', j.id, 'organization_id', j.organization_id)
        )
        FROM public.verification_jobs j
        WHERE j.status IN ('QUEUED', 'PARTIAL_REVIEW')
          AND j.attempts < 4
          AND j.next_attempt_at <= now()
        LIMIT 5;
      $$
    );
  END IF;
END;
$$;
