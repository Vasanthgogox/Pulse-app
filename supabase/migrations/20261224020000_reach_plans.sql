-- ============================================================
-- Reach Plans — admin-editable pricing catalog for publishing a campaign.
-- ============================================================
-- Basic/Boost/Max tiers (illustrative price + estimated verified-fleet-owner
-- reach). Prices/reach live here (DB, Control-Tower-editable), NOT hardcoded
-- in TS — only display metadata (icon/color/copy) lives in
-- lib/reachPlanRegistry.ts, mirroring how lib/productRegistry.ts separates
-- static definition from DB-driven state.

CREATE TABLE IF NOT EXISTS public.reach_plans (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text        NOT NULL UNIQUE CHECK (code IN ('basic', 'boost', 'max')),
  name                  text        NOT NULL,
  price_inr             numeric(10,2) NOT NULL,
  credit_price          bigint      NOT NULL,
  estimated_reach_min   int         NOT NULL,
  estimated_reach_max   int         NOT NULL,
  audience_scope        text        NOT NULL DEFAULT 'verified_fleet_owners',
  sort_order            int         NOT NULL DEFAULT 0,
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reach_plans_reach_range CHECK (estimated_reach_max >= estimated_reach_min)
);

DROP TRIGGER IF EXISTS trg_reach_plans_updated_at ON public.reach_plans;
CREATE TRIGGER trg_reach_plans_updated_at
  BEFORE UPDATE ON public.reach_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the three screenshot tiers. `code` is an internal identifier only
-- (never shown to users) — `name` is the user-facing label, logistics
-- language rather than generic tiers ("Reach up to N verified fleet owners"
-- is derived from estimated_reach_max at render time, not stored twice).
-- credit_price mirrors price_inr 1:1 for launch (1 credit == ₹1 of Reach
-- spend) — revisit if credits ever get their own exchange rate.
INSERT INTO public.reach_plans (code, name, price_inr, credit_price, estimated_reach_min, estimated_reach_max, sort_order)
VALUES
  ('basic', 'Starter',  250.00, 250,  1,  25,  1),
  ('boost', 'Growth',   500.00, 500, 26,  60,  2),
  ('max',   'Business', 1000.00, 1000, 61, 150,  3)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name;

ALTER TABLE public.reach_plans ENABLE ROW LEVEL SECURITY;

-- Any authenticated org member can read the catalog (needed to render the
-- plan picker on publish); only Control Tower can edit it.
DROP POLICY IF EXISTS "reach_plans_read_all" ON public.reach_plans;
CREATE POLICY "reach_plans_read_all" ON public.reach_plans
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "reach_plans_platform_write" ON public.reach_plans;
CREATE POLICY "reach_plans_platform_write" ON public.reach_plans
  FOR ALL USING (public.has_platform_permission((select auth.uid()), 'reach.manage'))
  WITH CHECK (public.has_platform_permission((select auth.uid()), 'reach.manage'));
