-- Indents: composite for time-ordered org listings
CREATE INDEX IF NOT EXISTS idx_indents_org_created_at
  ON public.indents (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Indents: composite for status-filtered listings ordered by pickup date
CREATE INDEX IF NOT EXISTS idx_indents_org_status_pickup_date
  ON public.indents (organization_id, status, pickup_date DESC)
  WHERE deleted_at IS NULL;

-- Driver salary requests: composite for org-scoped status-filtered ordered listings
CREATE INDEX IF NOT EXISTS idx_driver_salary_requests_org_status_created
  ON public.driver_salary_requests (organization_id, status, created_at DESC);

-- Driver salary requests: composite for driver-specific history within an org
CREATE INDEX IF NOT EXISTS idx_driver_salary_requests_org_driver_created
  ON public.driver_salary_requests (organization_id, driver_id, created_at DESC);

-- Organizations: GIN trigram index for ILIKE name search ('%query%' pattern)
-- pg_trgm is already enabled; the existing lower(name) btree cannot serve leading-wildcard ILIKE
CREATE INDEX IF NOT EXISTS idx_organizations_name_trgm
  ON public.organizations USING GIN (name gin_trgm_ops)
  WHERE deleted_at IS NULL;
