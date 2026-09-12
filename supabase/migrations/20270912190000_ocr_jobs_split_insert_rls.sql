-- Perf: ocr_jobs INSERT took ~11s in production. The single FOR ALL policy
-- "ocr_jobs_trip_access" used the same USING/WITH CHECK expression for every
-- command, so an INSERT's WITH CHECK evaluation paid for the full linked-trip
-- EXISTS branch — which pulls in trips' own SELECT RLS tree (org/supplier/
-- client/driver checks) — even though a new row's own organization_id is
-- always known and sufficient to authorize the insert.
--
-- The EXISTS branch exists for READ access to OCR jobs linked to a trip the
-- caller doesn't own directly (e.g. a partner viewing a shared trip's OCR
-- job). That reasoning does not apply to INSERT: the inserting org already
-- owns organization_id on the new row, so org membership alone is sufficient
-- and correct there.
--
-- Fix: split the one FOR ALL policy into command-scoped policies.
-- SELECT keeps the original policy name and the original USING expression.
-- UPDATE/DELETE keep the original USING/WITH CHECK expressions.
-- INSERT WITH CHECK is org-membership only (no trips SELECT RLS).
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "ocr_jobs_trip_access" ON public.ocr_jobs;
DROP POLICY IF EXISTS "ocr_jobs_trip_access_select" ON public.ocr_jobs;
DROP POLICY IF EXISTS "ocr_jobs_trip_access_insert" ON public.ocr_jobs;
DROP POLICY IF EXISTS "ocr_jobs_trip_access_update" ON public.ocr_jobs;
DROP POLICY IF EXISTS "ocr_jobs_trip_access_delete" ON public.ocr_jobs;

-- SELECT — original name + original USING (org member OR linked-trip EXISTS).
CREATE POLICY "ocr_jobs_trip_access"
  ON public.ocr_jobs
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR (
      trip_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = ocr_jobs.trip_id)
    )
  );

-- INSERT — narrowed: the new row's own organization_id is sufficient; no
-- need to evaluate trips' SELECT RLS tree on every insert.
CREATE POLICY "ocr_jobs_trip_access_insert"
  ON public.ocr_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
  );

-- UPDATE — unchanged effective behavior vs original FOR ALL.
CREATE POLICY "ocr_jobs_trip_access_update"
  ON public.ocr_jobs
  FOR UPDATE
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

-- DELETE — unchanged effective behavior vs original FOR ALL USING.
CREATE POLICY "ocr_jobs_trip_access_delete"
  ON public.ocr_jobs
  FOR DELETE
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR (
      trip_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = ocr_jobs.trip_id)
    )
  );
