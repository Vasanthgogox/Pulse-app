-- 008_get_pod_reconciliation_summary.sql
-- Function to get POD reconciliation summary for invoicing.

CREATE OR REPLACE FUNCTION public.get_pod_reconciliation_summary()
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
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- POD Pending
    COUNT(*) FILTER (
      WHERE t.invoice_no IS NULL 
        AND t.invoice_status_1 IS DISTINCT FROM 'Raised'
        AND (t.pod_status ILIKE '%pending%' OR t.pod_status ILIKE '%i-bond%' OR t.pod_status = '' OR t.pod_status IS NULL OR t.pod_status = 'partial')
    ) as pod_pending_count,
    COALESCE(SUM(t.client_price) FILTER (
      WHERE t.invoice_no IS NULL 
        AND t.invoice_status_1 IS DISTINCT FROM 'Raised'
        AND (t.pod_status ILIKE '%pending%' OR t.pod_status ILIKE '%i-bond%' OR t.pod_status = '' OR t.pod_status IS NULL OR t.pod_status = 'partial')
    ), 0) as pod_pending_sum,
    
    -- Received (Needs Action)
    COUNT(*) FILTER (
      WHERE t.invoice_no IS NULL 
        AND t.invoice_status_1 IS DISTINCT FROM 'Raised'
        AND t.pod_status ILIKE '%received%' 
        AND t.invoice_status_1 NOT ILIKE '%pending%' 
        AND t.invoice_status_1 NOT ILIKE '%data shared%'
    ) as received_count,
    COALESCE(SUM(t.client_price) FILTER (
      WHERE t.invoice_no IS NULL 
        AND t.invoice_status_1 IS DISTINCT FROM 'Raised'
        AND t.pod_status ILIKE '%received%' 
        AND t.invoice_status_1 NOT ILIKE '%pending%' 
        AND t.invoice_status_1 NOT ILIKE '%data shared%'
    ), 0) as received_sum,
    
    -- Approved (Ready)
    COUNT(*) FILTER (
      WHERE t.invoice_no IS NULL 
        AND t.invoice_status_1 IS DISTINCT FROM 'Raised'
        AND t.pod_status ILIKE '%received%' 
        AND (t.invoice_status_1 ILIKE '%pending%' OR t.invoice_status_1 ILIKE '%data shared%')
    ) as approved_count,
    COALESCE(SUM(t.client_price) FILTER (
      WHERE t.invoice_no IS NULL 
        AND t.invoice_status_1 IS DISTINCT FROM 'Raised'
        AND t.pod_status ILIKE '%received%' 
        AND (t.invoice_status_1 ILIKE '%pending%' OR t.invoice_status_1 ILIKE '%data shared%')
    ), 0) as approved_sum,
    
    -- Invoiced
    COUNT(*) FILTER (
      WHERE t.invoice_no IS NOT NULL OR t.invoice_status_1 = 'Raised'
    ) as invoiced_count,
    COALESCE(SUM(t.client_price) FILTER (
      WHERE t.invoice_no IS NOT NULL OR t.invoice_status_1 = 'Raised'
    ), 0) as invoiced_sum

  FROM public.trips t
  -- Only look at current user's organization trips, assuming RLS applies or we can just filter by organization context.
  -- RLS is handled implicitly if called from authenticated context.
  WHERE (t.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1) 
         OR 
         -- Or if the user is a supplier for this trip
         t.supplier_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));
END;
$$;
