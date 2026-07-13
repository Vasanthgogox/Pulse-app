-- Link indents to Commerce sales orders (cross-product ID only).
ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_indents_sales_order
  ON public.indents(sales_order_id)
  WHERE sales_order_id IS NOT NULL;
