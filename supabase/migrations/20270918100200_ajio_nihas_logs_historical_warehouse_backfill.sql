-- One-time, manually-confirmed backfill: link the 32 existing Ajio indents
-- in the "nihas logs" org to their warehouse (Periyapalayam), so ground_ops
-- warehouse-based scoping applies to these historical trips too, not just
-- indents created after 20270918100100.
--
-- These are legacy/native indents (sales_order_id and execution_plan_id
-- both NULL on every row) with client_id also NULL historically — the
-- client_id backfill in 20270918100000 already set client_id for these via
-- exact client_name match ("Ajio" -> the single Ajio client in this org).
--
-- Scoped tightly and explicitly to avoid any risk of misattaching other
-- orgs' data: hardcoded organization_id (nihas logs), hardcoded
-- warehouse_id (Ajio's single client_warehouses row, Periyapalayam),
-- filtered to client_id = that Ajio client AND warehouse_id currently NULL.
-- Confirmed via read-only query before writing this migration: exactly one
-- client named "Ajio" and exactly one client_warehouses row for it in this
-- org — no ambiguity.
--
-- This is a manual, human-confirmed correction (the org's admin confirmed
-- these 32 trips did originate from this warehouse) — not something the
-- migration infers on its own; do not reuse this pattern to backfill other
-- clients without the same explicit confirmation.

BEGIN;

UPDATE public.indents i
SET warehouse_id = '19a2cd92-ce29-4516-af3f-e73179e84fd2'  -- Ajio / Periyapalayam, nihas logs org
WHERE i.organization_id = '89427247-b09c-444b-ac85-17c1bf9fdf20'  -- nihas logs
  AND i.client_id = '0f99e7e0-389a-4ac9-b2ee-c4d50a2b1e91'        -- Ajio
  AND i.warehouse_id IS NULL
  AND i.deleted_at IS NULL;

COMMIT;
