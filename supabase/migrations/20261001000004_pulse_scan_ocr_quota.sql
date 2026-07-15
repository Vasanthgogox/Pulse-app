-- Pulse Scan Engine — monthly OCR quota enforcement per org tier.

CREATE OR REPLACE FUNCTION public.resolve_ocr_scan_monthly_limit(p_org_id uuid)
  RETURNS TABLE (tier text, monthly_limit bigint)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_catalog
AS $$
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.workspace_products wp
        WHERE wp.org_id = p_org_id
          AND wp.product_id IN ('pulse_invoice_pro', 'pulse_ai', 'pulse_fleet_pro')
          AND wp.status IN ('active', 'trial')
          AND (wp.expires_at IS NULL OR wp.expires_at > now())
      ) THEN 'invoice_pro'
      ELSE 'pulse_core'
    END AS tier,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.workspace_products wp
        WHERE wp.org_id = p_org_id
          AND wp.product_id IN ('pulse_invoice_pro', 'pulse_ai', 'pulse_fleet_pro')
          AND wp.status IN ('active', 'trial')
          AND (wp.expires_at IS NULL OR wp.expires_at > now())
          AND COALESCE((wp.metadata ->> 'ocr_unlimited')::boolean, false)
      ) THEN NULL::bigint
      WHEN EXISTS (
        SELECT 1 FROM public.workspace_products wp
        WHERE wp.org_id = p_org_id
          AND wp.product_id IN ('pulse_invoice_pro', 'pulse_ai', 'pulse_fleet_pro')
          AND wp.status IN ('active', 'trial')
          AND (wp.expires_at IS NULL OR wp.expires_at > now())
      ) THEN 500::bigint
      ELSE 50::bigint
    END AS monthly_limit;
$$;

CREATE OR REPLACE FUNCTION public.check_ocr_scan_quota(p_org_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_catalog
AS $$
DECLARE
  v_tier text;
  v_limit bigint;
  v_used bigint;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', 0,
      'limit', 0,
      'tier', 'forbidden',
      'reason', 'not_org_member'
    );
  END IF;

  SELECT tier, monthly_limit INTO v_tier, v_limit
  FROM public.resolve_ocr_scan_monthly_limit(p_org_id);

  SELECT count(*)::bigint INTO v_used
  FROM public.ocr_jobs j
  WHERE j.organization_id = p_org_id
    AND j.created_at >= date_trunc('month', now())
    AND NOT j.is_duplicate
    AND j.status IN ('pending', 'processing', 'completed');

  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used', v_used,
      'limit', null,
      'tier', v_tier
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_used < v_limit,
    'used', v_used,
    'limit', v_limit,
    'tier', v_tier,
    'reason', CASE WHEN v_used >= v_limit THEN 'monthly_limit_reached' ELSE null END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_ocr_scan_monthly_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ocr_scan_quota(uuid) TO authenticated;

COMMENT ON FUNCTION public.check_ocr_scan_quota IS
  'Pulse Scan quota: pulse_core 50/mo, invoice_pro 500/mo, enterprise (metadata.ocr_unlimited) unlimited.';
