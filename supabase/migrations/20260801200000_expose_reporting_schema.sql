-- 1. Reporting schema (cashflow_forecast lives here).
--    Add `reporting` to Supabase Dashboard → Settings → API → Extra schemas so
--    PostgREST exposes it and .schema('reporting').from('cashflow_forecast') resolves.

CREATE SCHEMA IF NOT EXISTS reporting;

GRANT USAGE ON SCHEMA reporting TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting
  GRANT SELECT ON TABLES TO anon, authenticated;

-- cashflow_forecast: per-org daily inflow forecast populated by the AI backend.
CREATE TABLE IF NOT EXISTS reporting.cashflow_forecast (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date             date        NOT NULL,
  expected_inflow  numeric     NOT NULL DEFAULT 0,
  confidence       numeric     NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cashflow_forecast_org_date_idx
  ON reporting.cashflow_forecast (organization_id, date);

ALTER TABLE reporting.cashflow_forecast ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_read_cashflow" ON reporting.cashflow_forecast;
CREATE POLICY "org_members_read_cashflow"
  ON reporting.cashflow_forecast FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- 2. Public AI tables consumed by ai.service.ts via the default public schema.

CREATE TABLE IF NOT EXISTS public.client_risk_scores (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        uuid        NOT NULL,
  risk_score       numeric     NOT NULL DEFAULT 0,
  predicted_delay  numeric     NOT NULL DEFAULT 0,
  last_updated     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_risk_scores_org_client_idx
  ON public.client_risk_scores (organization_id, client_id);

ALTER TABLE public.client_risk_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_members_read_client_risk" ON public.client_risk_scores;
CREATE POLICY "org_members_read_client_risk"
  ON public.client_risk_scores FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.trip_predictions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_id          uuid        NOT NULL,
  predicted_cost   numeric     NOT NULL DEFAULT 0,
  predicted_profit numeric     NOT NULL DEFAULT 0,
  confidence_score numeric     NOT NULL DEFAULT 0,
  risk_flag        text        NOT NULL DEFAULT 'ok',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_predictions_trip_idx
  ON public.trip_predictions (trip_id);

ALTER TABLE public.trip_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_members_read_trip_predictions" ON public.trip_predictions;
CREATE POLICY "org_members_read_trip_predictions"
  ON public.trip_predictions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.vehicle_health_scores (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id               uuid        NOT NULL,
  health_score             numeric     NOT NULL DEFAULT 100,
  next_maintenance_at      timestamptz,
  breakdown_probability    numeric,
  last_updated             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_health_scores_org_vehicle_idx
  ON public.vehicle_health_scores (organization_id, vehicle_id);

ALTER TABLE public.vehicle_health_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_members_read_vehicle_health" ON public.vehicle_health_scores;
CREATE POLICY "org_members_read_vehicle_health"
  ON public.vehicle_health_scores FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.ai_settings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  auto_post_ocr         boolean     NOT NULL DEFAULT false,
  auto_flag_risk        boolean     NOT NULL DEFAULT false,
  auto_enforce_credit   boolean     NOT NULL DEFAULT false,
  auto_assign_vehicle   boolean     NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_members_read_ai_settings" ON public.ai_settings;
CREATE POLICY "org_members_read_ai_settings"
  ON public.ai_settings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "org_admins_write_ai_settings" ON public.ai_settings;
CREATE POLICY "org_admins_write_ai_settings"
  ON public.ai_settings FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Reload PostgREST so reporting schema is live immediately.
NOTIFY pgrst, 'reload config';
