-- Subscription billing lifecycle: auto-expire workspace_products when dates pass.
-- Uses pg_cron for daily enforcement. Also adds an RPC to manually expire one org.

-- ── Daily expiry enforcement function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_expire_workspace_products()
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Trial → suspended when trial_ends_at has passed and not yet active
  UPDATE public.workspace_products
  SET
    status = 'suspended',
    updated_at = now()
  WHERE status = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();

  -- Active → suspended when expires_at has passed (missed renewal)
  UPDATE public.workspace_products
  SET
    status = 'suspended',
    updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now() - interval '3 days';  -- 3-day grace period
END;
$$;

REVOKE ALL ON FUNCTION public.fn_expire_workspace_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_expire_workspace_products() TO service_role;

-- ── Trigger: updated_at maintenance ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_workspace_products_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_products_updated_at ON public.workspace_products;
CREATE TRIGGER trg_workspace_products_updated_at
  BEFORE UPDATE ON public.workspace_products
  FOR EACH ROW EXECUTE FUNCTION public.fn_workspace_products_updated_at();

-- ── RPC: get active products for org (app-facing, cached) ────────────────────
CREATE OR REPLACE FUNCTION public.get_org_active_products(p_org_id uuid)
  RETURNS TABLE (
    product_id      text,
    status          text,
    activated_at    timestamptz,
    trial_ends_at   timestamptz,
    expires_at      timestamptz,
    billing_cycle   text,
    seats           int,
    days_remaining  int
  )
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Enforce auth: caller must be member of this org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    wp.product_id,
    wp.status,
    wp.activated_at,
    wp.trial_ends_at,
    wp.expires_at,
    wp.billing_cycle,
    wp.seats,
    CASE
      WHEN wp.status = 'trial' AND wp.trial_ends_at IS NOT NULL
        THEN greatest(0, extract(day FROM (wp.trial_ends_at - now()))::int)
      WHEN wp.status = 'active' AND wp.expires_at IS NOT NULL
        THEN greatest(0, extract(day FROM (wp.expires_at - now()))::int)
      ELSE NULL
    END AS days_remaining
  FROM public.workspace_products wp
  WHERE wp.org_id = p_org_id
    AND wp.status IN ('active', 'trial')
  ORDER BY wp.product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_active_products(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_active_products(uuid) TO authenticated;

-- ── pg_cron: daily expiry job ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'workspace_products_expire',
      '0 3 * * *',   -- 3am daily
      $cron$ SELECT public.fn_expire_workspace_products(); $cron$
    );
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron not available: %', SQLERRM;
END;
$$;

-- Run once to enforce current state
SELECT public.fn_expire_workspace_products();
