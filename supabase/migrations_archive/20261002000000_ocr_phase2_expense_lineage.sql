-- OCR Phase 2: expense OCR lineage, engine metadata, extended metrics.

-- ── ocr_jobs engine metadata ─────────────────────────────────────────────────
ALTER TABLE public.ocr_jobs
  ADD COLUMN IF NOT EXISTS engine_name text,
  ADD COLUMN IF NOT EXISTS prompt_version text;

UPDATE public.ocr_jobs
SET
  engine_name = COALESCE(engine_name, 'pulse-scan-engine'),
  prompt_version = COALESCE(prompt_version, 'v1')
WHERE engine_name IS NULL OR prompt_version IS NULL;

ALTER TABLE public.ocr_jobs
  ALTER COLUMN engine_name SET DEFAULT 'pulse-scan-engine',
  ALTER COLUMN engine_name SET NOT NULL,
  ALTER COLUMN prompt_version SET DEFAULT 'v1',
  ALTER COLUMN prompt_version SET NOT NULL;

COMMENT ON COLUMN public.ocr_jobs.engine_name IS
  'Pulse Scan engine product name (e.g. pulse-scan-engine).';
COMMENT ON COLUMN public.ocr_jobs.prompt_version IS
  'Extractor prompt revision; bump with engine_version when prompts change.';

-- ── expense → ocr_jobs lineage ───────────────────────────────────────────────
ALTER TABLE public.trip_fuel_entries
  ADD COLUMN IF NOT EXISTS ocr_job_id uuid REFERENCES public.ocr_jobs(id) ON DELETE SET NULL;

ALTER TABLE public.trip_toll_entries
  ADD COLUMN IF NOT EXISTS ocr_job_id uuid REFERENCES public.ocr_jobs(id) ON DELETE SET NULL;

ALTER TABLE public.trip_other_expenses
  ADD COLUMN IF NOT EXISTS ocr_job_id uuid REFERENCES public.ocr_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trip_fuel_entries_ocr_job
  ON public.trip_fuel_entries (ocr_job_id)
  WHERE ocr_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trip_toll_entries_ocr_job
  ON public.trip_toll_entries (ocr_job_id)
  WHERE ocr_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trip_other_expenses_ocr_job
  ON public.trip_other_expenses (ocr_job_id)
  WHERE ocr_job_id IS NOT NULL;

COMMENT ON COLUMN public.trip_fuel_entries.ocr_job_id IS
  'Pulse Scan job that produced bill OCR for this fuel entry.';
COMMENT ON COLUMN public.trip_toll_entries.ocr_job_id IS
  'Pulse Scan job that produced receipt OCR for this toll entry.';
COMMENT ON COLUMN public.trip_other_expenses.ocr_job_id IS
  'Pulse Scan job that produced receipt OCR for this expense entry.';

-- ── Extended metrics RPC (dashboard) ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_ocr_metrics(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_ocr_metrics(
  p_org_id uuid,
  p_days integer DEFAULT 30
)
  RETURNS TABLE (
    jobs_today bigint,
    jobs_this_month bigint,
    jobs_in_window bigint,
    avg_duration_ms numeric,
    avg_confidence numeric,
    failed_count bigint,
    duplicate_count bigint,
    quota_used bigint,
    quota_limit bigint,
    quota_remaining bigint,
    quota_tier text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_catalog
AS $$
DECLARE
  v_quota jsonb;
  v_limit bigint;
  v_used bigint;
  v_tier text;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN;
  END IF;

  v_quota := public.check_ocr_scan_quota(p_org_id);
  v_used := COALESCE((v_quota ->> 'used')::bigint, 0);
  v_tier := COALESCE(v_quota ->> 'tier', 'pulse_core');
  v_limit := CASE
    WHEN v_quota ->> 'limit' IS NULL THEN NULL::bigint
    ELSE (v_quota ->> 'limit')::bigint
  END;

  RETURN QUERY
  SELECT
    (
      SELECT count(*)::bigint
      FROM public.ocr_jobs j
      WHERE j.organization_id = p_org_id
        AND j.created_at >= date_trunc('day', now())
    ) AS jobs_today,
    (
      SELECT count(*)::bigint
      FROM public.ocr_jobs j
      WHERE j.organization_id = p_org_id
        AND j.created_at >= date_trunc('month', now())
        AND NOT j.is_duplicate
        AND j.status IN ('pending', 'processing', 'completed')
    ) AS jobs_this_month,
    (
      SELECT count(*)::bigint
      FROM public.ocr_jobs j
      WHERE j.organization_id = p_org_id
        AND j.created_at >= now() - make_interval(days => greatest(p_days, 1))
    ) AS jobs_in_window,
    (
      SELECT round(avg(j.processing_duration_ms), 2)
      FROM public.ocr_jobs j
      WHERE j.organization_id = p_org_id
        AND j.created_at >= now() - make_interval(days => greatest(p_days, 1))
        AND j.status = 'completed'
    ) AS avg_duration_ms,
    (
      SELECT round(avg(j.confidence_score), 4)
      FROM public.ocr_jobs j
      WHERE j.organization_id = p_org_id
        AND j.created_at >= now() - make_interval(days => greatest(p_days, 1))
        AND j.status = 'completed'
        AND j.confidence_score IS NOT NULL
    ) AS avg_confidence,
    (
      SELECT count(*)::bigint
      FROM public.ocr_jobs j
      WHERE j.organization_id = p_org_id
        AND j.created_at >= now() - make_interval(days => greatest(p_days, 1))
        AND j.status = 'failed'
    ) AS failed_count,
    (
      SELECT count(*)::bigint
      FROM public.ocr_jobs j
      WHERE j.organization_id = p_org_id
        AND j.created_at >= now() - make_interval(days => greatest(p_days, 1))
        AND j.is_duplicate
    ) AS duplicate_count,
    v_used AS quota_used,
    v_limit AS quota_limit,
    CASE
      WHEN v_limit IS NULL THEN NULL::bigint
      ELSE greatest(v_limit - v_used, 0)::bigint
    END AS quota_remaining,
    v_tier AS quota_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ocr_metrics(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.get_ocr_metrics IS
  'Pulse Scan dashboard: scans today/month, failures, dedup savings, avg confidence, quota.';
