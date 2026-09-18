-- Extend ground_ops warehouse scoping to legacy/native indents.
--
-- Today ground_ops warehouse resolution only works for Commerce-flow
-- indents (sales_order_id / execution_plan_id set). Most indents in this
-- database are legacy/native — created via the older, non-Commerce flow —
-- and have neither. This adds a direct, optional warehouse link so
-- create-indent (which already lets the creator pick a client and fetches
-- that client's warehouses for pickup-location autocomplete — see
-- app/create-indent/index.tsx useClientWarehousesQuery /
-- buildPickupRecommendations) can persist the chosen warehouse's id, not
-- just its address text.
--
-- indents.client_id already exists (added in
-- 20270308103000_sale_rate_snapshot.sql) but is only populated when the
-- create-indent form's client picker was used; many historical indents
-- have client_id NULL with only free-text client_name set. This migration
-- also backfills client_id for indents where client_name matches exactly
-- one client in the same org (skips ambiguous names — confirmed only one
-- such case exists org-wide as of this migration, "Luminous" with 2
-- clients in one org).
--
-- warehouse_id is intentionally NOT backfilled: there is no reliable way
-- to infer which warehouse a historical trip used from free-text
-- pickup_area/drop_location. Historical indents stay warehouse_id = NULL
-- (unscoped for ground_ops, same as today) until/unless someone manually
-- sets it. Only NEW indents created after the app-side change ships will
-- get warehouse_id populated automatically.

BEGIN;

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.client_warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_indents_warehouse_id
  ON public.indents(warehouse_id)
  WHERE warehouse_id IS NOT NULL;

COMMENT ON COLUMN public.indents.warehouse_id IS
  'Optional direct warehouse link for legacy/native indents (no sales_order_id/execution_plan_id). Set by create-indent when the creator picks a client + one of that client''s client_warehouses. NULL means unscoped for ground_ops warehouse-based visibility — matches pre-migration behavior.';

-- One-time backfill: client_id where client_name matches exactly one
-- client in the same org (unambiguous only).
UPDATE public.indents i
SET client_id = c.id
FROM public.clients c
WHERE i.client_id IS NULL
  AND i.deleted_at IS NULL
  AND c.organization_id = i.organization_id
  AND lower(trim(c.name)) = lower(trim(i.client_name))
  AND (
    SELECT count(*) FROM public.clients c2
    WHERE c2.organization_id = i.organization_id
      AND lower(trim(c2.name)) = lower(trim(i.client_name))
  ) = 1;

COMMIT;
