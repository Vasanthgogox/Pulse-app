-- Rename commerce_products → products (platform-owned master data).
-- Commerce workflow tables (sales_orders, commerce_inventory) keep commerce_* prefix.
-- FKs from commerce_inventory and sales_order_lines follow the table rename automatically.

ALTER TABLE IF EXISTS public.commerce_products RENAME TO products;

ALTER INDEX IF EXISTS idx_commerce_products_org RENAME TO idx_products_org;
ALTER INDEX IF EXISTS idx_commerce_products_status RENAME TO idx_products_status;

ALTER POLICY IF EXISTS "commerce_products_select" ON public.products RENAME TO "products_select";
ALTER POLICY IF EXISTS "commerce_products_insert" ON public.products RENAME TO "products_insert";
ALTER POLICY IF EXISTS "commerce_products_update" ON public.products RENAME TO "products_update";
ALTER POLICY IF EXISTS "commerce_products_delete" ON public.products RENAME TO "products_delete";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_commerce_products_updated_at'
      AND tgrelid = 'public.products'::regclass
  ) THEN
    ALTER TRIGGER trg_commerce_products_updated_at ON public.products
      RENAME TO trg_products_updated_at;
  END IF;
END $$;

COMMENT ON TABLE public.products IS
  'Platform product catalog — shared by Core (trip cargo) and Commerce (catalog). Workspace-scoped via organization_id.';
