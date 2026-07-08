-- One active indent per sales order per organization (idempotent publish).
CREATE UNIQUE INDEX IF NOT EXISTS idx_indents_org_sales_order_unique
  ON public.indents(organization_id, sales_order_id)
  WHERE sales_order_id IS NOT NULL AND deleted_at IS NULL;
