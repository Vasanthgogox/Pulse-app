-- OCR job queue + vehicle odometer events (persist-once architecture).
-- OCR runs at most once per (document_fingerprint, engine_version); results stored as JSON.

CREATE TYPE public.ocr_job_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

CREATE TABLE IF NOT EXISTS public.ocr_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_fingerprint text NOT NULL,
  source_kind text NOT NULL,
  source_subtype text,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  trip_document_id uuid REFERENCES public.trip_documents(id) ON DELETE SET NULL,
  pod_attachment_id uuid,
  storage_path text,
  status public.ocr_job_status NOT NULL DEFAULT 'pending',
  engine_version text NOT NULL,
  ocr_model text,
  confidence_score numeric(6, 5),
  result_json jsonb,
  raw_model_json jsonb,
  error_message text,
  is_duplicate boolean NOT NULL DEFAULT false,
  duplicate_of_job_id uuid REFERENCES public.ocr_jobs(id) ON DELETE SET NULL,
  force_rescan boolean NOT NULL DEFAULT false,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  processing_duration_ms integer,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocr_jobs_source_kind_check CHECK (
    source_kind = ANY (
      ARRAY[
        'odometer'::text,
        'expense_receipt'::text,
        'pod_document'::text
      ]
    )
  ),
  CONSTRAINT ocr_jobs_confidence_range CHECK (
    confidence_score IS NULL
    OR (confidence_score >= 0 AND confidence_score <= 1)
  )
);

COMMENT ON TABLE public.ocr_jobs IS
  'Durable OCR job queue. One completed row per document fingerprint + engine_version unless force_rescan.';

CREATE UNIQUE INDEX IF NOT EXISTS ocr_jobs_fingerprint_engine_completed_uidx
  ON public.ocr_jobs (document_fingerprint, engine_version)
  WHERE status = 'completed' AND NOT force_rescan;

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status_pending
  ON public.ocr_jobs (status, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_trip_document
  ON public.ocr_jobs (trip_document_id)
  WHERE trip_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_org_created
  ON public.ocr_jobs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_trip_id
  ON public.ocr_jobs (trip_id)
  WHERE trip_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vehicle_odometer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  ocr_job_id uuid REFERENCES public.ocr_jobs(id) ON DELETE SET NULL,
  event_side text NOT NULL,
  odometer_km numeric(12, 2) NOT NULL,
  confidence_score numeric(6, 5),
  reading_source text NOT NULL DEFAULT 'ocr',
  photo_storage_path text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_odometer_events_side_check CHECK (
    event_side = ANY (ARRAY['start'::text, 'end'::text])
  ),
  CONSTRAINT vehicle_odometer_events_reading_source_check CHECK (
    reading_source = ANY (ARRAY['ocr'::text, 'manual'::text])
  ),
  CONSTRAINT vehicle_odometer_events_confidence_range CHECK (
    confidence_score IS NULL
    OR (confidence_score >= 0 AND confidence_score <= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_vehicle_odometer_events_vehicle_recorded
  ON public.vehicle_odometer_events (vehicle_id, recorded_at DESC)
  WHERE vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_odometer_events_trip_side
  ON public.vehicle_odometer_events (trip_id, event_side)
  WHERE trip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_odometer_events_ocr_job
  ON public.vehicle_odometer_events (ocr_job_id)
  WHERE ocr_job_id IS NOT NULL;

ALTER TABLE public.trip_documents
  ADD COLUMN IF NOT EXISTS ocr_job_id uuid REFERENCES public.ocr_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trip_documents_ocr_job
  ON public.trip_documents (ocr_job_id)
  WHERE ocr_job_id IS NOT NULL;

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_ocr_jobs_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ocr_jobs_updated_at ON public.ocr_jobs;
CREATE TRIGGER trg_ocr_jobs_updated_at
  BEFORE UPDATE ON public.ocr_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_ocr_jobs_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ocr_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_odometer_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.ocr_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vehicle_odometer_events TO authenticated;
GRANT ALL ON public.ocr_jobs TO service_role;
GRANT ALL ON public.vehicle_odometer_events TO service_role;

DROP POLICY IF EXISTS "ocr_jobs_trip_access" ON public.ocr_jobs;
CREATE POLICY "ocr_jobs_trip_access"
  ON public.ocr_jobs
  FOR ALL
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR (
      trip_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = ocr_jobs.trip_id)
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    OR (
      trip_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = ocr_jobs.trip_id)
    )
  );

DROP POLICY IF EXISTS "vehicle_odometer_events_trip_access" ON public.vehicle_odometer_events;
CREATE POLICY "vehicle_odometer_events_trip_access"
  ON public.vehicle_odometer_events
  FOR ALL
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR (
      trip_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = vehicle_odometer_events.trip_id)
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    OR (
      trip_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = vehicle_odometer_events.trip_id)
    )
  );

-- ── Metrics (org-scoped RPC) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ocr_metrics(
  p_org_id uuid,
  p_days integer DEFAULT 30
)
  RETURNS TABLE (
    jobs_today bigint,
    jobs_in_window bigint,
    avg_duration_ms numeric,
    failed_count bigint,
    duplicate_count bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_catalog
AS $$
  SELECT
    count(*) FILTER (
      WHERE j.created_at >= date_trunc('day', now())
    ) AS jobs_today,
    count(*) AS jobs_in_window,
    round(avg(j.processing_duration_ms) FILTER (WHERE j.status = 'completed'), 2) AS avg_duration_ms,
    count(*) FILTER (WHERE j.status = 'failed') AS failed_count,
    count(*) FILTER (WHERE j.is_duplicate) AS duplicate_count
  FROM public.ocr_jobs j
  WHERE j.organization_id = p_org_id
    AND j.created_at >= now() - make_interval(days => greatest(p_days, 1))
    AND public.is_org_member(p_org_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_ocr_metrics(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.get_ocr_metrics IS
  'OCR ops metrics: jobs/day, avg duration, failures, duplicate fingerprint detections.';
