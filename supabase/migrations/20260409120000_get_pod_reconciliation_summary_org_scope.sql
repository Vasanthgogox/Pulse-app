-- POD reconciliation summary: scope by selected org + align amounts with app (total_client_value).

DROP FUNCTION IF EXISTS public.get_pod_reconciliation_summary();

CREATE OR REPLACE FUNCTION public.get_pod_reconciliation_summary(p_organization_id uuid DEFAULT NULL)
RETURNS TABLE (
  pod_pending_count bigint,
  pod_pending_sum numeric,
  received_count bigint,
  received_sum numeric,
  approved_count bigint,
  approved_sum numeric,
  invoiced_count bigint,
  invoiced_sum numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  v_org := COALESCE(
    p_organization_id,
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

  RETURN QUERY
  SELECT
    COUNT(t.id) FILTER (
      WHERE (t.invoice_no IS NULL OR t.invoice_no = '')
        AND (t.invoice_status_1 IS NULL OR t.invoice_status_1 != 'Raised')
        AND (
          t.pod_status ILIKE '%pending%'
          OR t.pod_status ILIKE '%i-bond%'
          OR t.pod_status = ''
          OR t.pod_status IS NULL
          OR t.pod_status = 'partial'
        )
    ) AS pod_pending_count,
    COALESCE(
      SUM(COALESCE(t.total_client_value, t.client_price, 0)) FILTER (
        WHERE (t.invoice_no IS NULL OR t.invoice_no = '')
          AND (t.invoice_status_1 IS NULL OR t.invoice_status_1 != 'Raised')
          AND (
            t.pod_status ILIKE '%pending%'
            OR t.pod_status ILIKE '%i-bond%'
            OR t.pod_status = ''
            OR t.pod_status IS NULL
            OR t.pod_status = 'partial'
          )
      ),
      0
    ) AS pod_pending_sum,

    COUNT(t.id) FILTER (
      WHERE (t.invoice_no IS NULL OR t.invoice_no = '')
        AND (t.invoice_status_1 IS NULL OR t.invoice_status_1 != 'Raised')
        AND t.pod_status ILIKE '%received%'
        AND (
          t.invoice_status_1 IS NULL
          OR (
            t.invoice_status_1 NOT ILIKE '%pending%'
            AND t.invoice_status_1 NOT ILIKE '%data shared%'
          )
        )
    ) AS received_count,
    COALESCE(
      SUM(COALESCE(t.total_client_value, t.client_price, 0)) FILTER (
        WHERE (t.invoice_no IS NULL OR t.invoice_no = '')
          AND (t.invoice_status_1 IS NULL OR t.invoice_status_1 != 'Raised')
          AND t.pod_status ILIKE '%received%'
          AND (
            t.invoice_status_1 IS NULL
            OR (
              t.invoice_status_1 NOT ILIKE '%pending%'
              AND t.invoice_status_1 NOT ILIKE '%data shared%'
            )
          )
      ),
      0
    ) AS received_sum,

    COUNT(t.id) FILTER (
      WHERE (t.invoice_no IS NULL OR t.invoice_no = '')
        AND (t.invoice_status_1 IS NULL OR t.invoice_status_1 != 'Raised')
        AND t.pod_status ILIKE '%received%'
        AND (
          t.invoice_status_1 ILIKE '%pending%'
          OR t.invoice_status_1 ILIKE '%data shared%'
        )
    ) AS approved_count,
    COALESCE(
      SUM(COALESCE(t.total_client_value, t.client_price, 0)) FILTER (
        WHERE (t.invoice_no IS NULL OR t.invoice_no = '')
          AND (t.invoice_status_1 IS NULL OR t.invoice_status_1 != 'Raised')
          AND t.pod_status ILIKE '%received%'
          AND (
            t.invoice_status_1 ILIKE '%pending%'
            OR t.invoice_status_1 ILIKE '%data shared%'
          )
      ),
      0
    ) AS approved_sum,

    COUNT(t.id) FILTER (
      WHERE (t.invoice_no IS NOT NULL AND t.invoice_no != '')
        OR t.invoice_status_1 = 'Raised'
    ) AS invoiced_count,
    COALESCE(
      SUM(COALESCE(t.total_client_value, t.client_price, 0)) FILTER (
        WHERE (t.invoice_no IS NOT NULL AND t.invoice_no != '')
          OR t.invoice_status_1 = 'Raised'
      ),
      0
    ) AS invoiced_sum
  FROM public.trips t
  WHERE t.organization_id = v_org
     OR t.supplier_id = v_org;
END;
$$;

COMMENT ON FUNCTION public.get_pod_reconciliation_summary(uuid) IS
  'Aggregates POD / invoice buckets for trips visible to the org (owner or supplier). Pass p_organization_id to match app org switcher; omit to use profile.organization_id.';
