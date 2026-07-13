-- ─────────────────────────────────────────────────────────────────────────────
-- Pulse Workspace — Multi-Product Platform Architecture
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Product activations per organisation ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspace_products (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id      text        NOT NULL,
  status          text        NOT NULL DEFAULT 'inactive',
  -- Status values:
  --   inactive  : not subscribed
  --   trial     : free trial active
  --   active    : paid subscription active
  --   suspended : payment failed
  --   cancelled : cancelled, access ends at expires_at
  activated_at    timestamptz,
  trial_ends_at   timestamptz,
  expires_at      timestamptz,
  billing_cycle   text,             -- 'monthly' | 'annual'
  seats           int,              -- null = unlimited / usage-based
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wp_org_product_unique UNIQUE (org_id, product_id),
  CONSTRAINT wp_status_check CHECK (
    status IN ('inactive','trial','active','suspended','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_wp_org        ON public.workspace_products(org_id);
CREATE INDEX IF NOT EXISTS idx_wp_product    ON public.workspace_products(product_id);
CREATE INDEX IF NOT EXISTS idx_wp_active     ON public.workspace_products(org_id, status)
  WHERE status IN ('active', 'trial');

ALTER TABLE public.workspace_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_view_products"
  ON public.workspace_products FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "org_admins_manage_products"
  ON public.workspace_products FOR ALL
  USING (
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- ── 2. Waitlist registrations ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_waitlist (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      text        NOT NULL,
  org_id          uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text        NOT NULL,
  full_name       text,
  company_name    text,
  fleet_size      text,           -- '1-5', '6-20', '21-50', '50+'
  use_case        text,           -- brief description of how they'd use it
  referral_source text,
  status          text        NOT NULL DEFAULT 'pending',  -- pending | invited | activated
  invited_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pw_org_product_unique UNIQUE (org_id, product_id),
  CONSTRAINT pw_status_check CHECK (status IN ('pending', 'invited', 'activated'))
);

CREATE INDEX IF NOT EXISTS idx_pwl_product ON public.product_waitlist(product_id, status);
CREATE INDEX IF NOT EXISTS idx_pwl_org     ON public.product_waitlist(org_id);

ALTER TABLE public.product_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_waitlist"
  ON public.product_waitlist FOR ALL
  USING (user_id = auth.uid() OR org_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = auth.uid()
  ));

-- ── 3. Usage metering ─────────────────────────────────────────────────────────
-- Track feature consumption for usage-based billing and quota enforcement.

CREATE TABLE IF NOT EXISTS public.product_usage (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id      text        NOT NULL,
  metric_key      text        NOT NULL,  -- 'trips_created', 'invoices_generated', 'ai_queries', etc.
  quantity        bigint      NOT NULL DEFAULT 1,
  period_start    date        NOT NULL,  -- month start (first of month)
  period_end      date        NOT NULL,  -- month end
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pu_org_product_metric_period UNIQUE (org_id, product_id, metric_key, period_start)
);

CREATE INDEX IF NOT EXISTS idx_pu_org_period    ON public.product_usage(org_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_pu_product_metric ON public.product_usage(product_id, metric_key, period_start DESC);

ALTER TABLE public.product_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_view_usage"
  ON public.product_usage FOR SELECT
  USING (
    org_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- ── 4. Increment usage meter (atomic, safe for concurrent calls) ──────────────

CREATE OR REPLACE FUNCTION public.increment_product_usage(
  p_org_id     uuid,
  p_product_id text,
  p_metric_key text,
  p_quantity   bigint DEFAULT 1
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.product_usage
    (org_id, product_id, metric_key, quantity, period_start, period_end)
  VALUES
    (p_org_id, p_product_id, p_metric_key, p_quantity,
     date_trunc('month', now())::date,
     (date_trunc('month', now()) + interval '1 month - 1 day')::date)
  ON CONFLICT (org_id, product_id, metric_key, period_start)
  DO UPDATE SET quantity = product_usage.quantity + EXCLUDED.quantity,
               recorded_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.increment_product_usage(uuid, text, text, bigint) TO authenticated;

-- ── 5. Get active products for an org ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_active_products(p_org_id uuid)
RETURNS TABLE (product_id text, status text, trial_ends_at timestamptz, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT product_id, status, trial_ends_at, expires_at
  FROM public.workspace_products
  WHERE org_id = p_org_id
    AND status IN ('active', 'trial')
    AND (expires_at IS NULL OR expires_at > now());
$$;

GRANT EXECUTE ON FUNCTION public.get_active_products(uuid) TO authenticated;

-- ── 6. Seed Pulse Core as active for all existing organisations ───────────────

INSERT INTO public.workspace_products (org_id, product_id, status, activated_at)
SELECT id, 'pulse_core', 'active', now()
FROM public.organizations
ON CONFLICT (org_id, product_id) DO NOTHING;

-- ── 7. Trigger: auto-activate Pulse Core for new organisations ────────────────

CREATE OR REPLACE FUNCTION public.activate_pulse_core_on_org_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_products (org_id, product_id, status, activated_at)
  VALUES (NEW.id, 'pulse_core', 'active', now())
  ON CONFLICT (org_id, product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activate_pulse_core ON public.organizations;

CREATE TRIGGER trg_activate_pulse_core
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.activate_pulse_core_on_org_create();

-- ── 8. Waitlist RPC: join or update waitlist entry ───────────────────────────

CREATE OR REPLACE FUNCTION public.join_product_waitlist(
  p_product_id    text,
  p_org_id        uuid,
  p_email         text,
  p_full_name     text DEFAULT NULL,
  p_company_name  text DEFAULT NULL,
  p_fleet_size    text DEFAULT NULL,
  p_use_case      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_waitlist
    (product_id, org_id, user_id, email, full_name, company_name, fleet_size, use_case)
  VALUES
    (p_product_id, p_org_id, auth.uid(), p_email, p_full_name, p_company_name, p_fleet_size, p_use_case)
  ON CONFLICT (org_id, product_id)
  DO UPDATE SET
    email        = EXCLUDED.email,
    full_name    = coalesce(EXCLUDED.full_name, product_waitlist.full_name),
    fleet_size   = coalesce(EXCLUDED.fleet_size, product_waitlist.fleet_size),
    use_case     = coalesce(EXCLUDED.use_case, product_waitlist.use_case);

  RETURN jsonb_build_object('success', true, 'product_id', p_product_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_product_waitlist(text,uuid,text,text,text,text,text) TO authenticated;
