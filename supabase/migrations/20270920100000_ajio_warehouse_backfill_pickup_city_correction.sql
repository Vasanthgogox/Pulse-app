-- Correction to 20270918100200_ajio_nihas_logs_historical_warehouse_backfill.sql.
--
-- That migration linked ALL 35 historical Ajio indents in the "nihas logs"
-- org to the Periyapalayam warehouse, on the assumption (confirmed at the
-- time) that they all originated from it. Real data review after ground_ops
-- started seeing these trips showed this was wrong: the 35 indents span 21
-- distinct pickup cities across India (Chennai, Hyderabad, Mumbai, Delhi,
-- Kolkata, Nagpur, Salem, Madurai, ...) — clearly NOT a single-warehouse
-- origin. Only 8 of the 35 have pickup_area matching "Chennai" (the only
-- real warehouse's city; Periyapalayam is that warehouse's own name/
-- locality within Chennai).
--
-- This migration corrects the over-broad backfill: keeps warehouse_id set
-- only on indents whose own pickup_area matches the warehouse's city
-- (ilike '%chennai%'), nulls it out on the other 27. Those 27 have no real
-- single-warehouse origin in this org's data — they go back to being
-- unscoped for ground_ops (correct, conservative default) until/unless a
-- real per-trip warehouse mapping exists for them.

BEGIN;

UPDATE public.indents i
SET warehouse_id = NULL
WHERE i.organization_id = '89427247-b09c-444b-ac85-17c1bf9fdf20'  -- nihas logs
  AND i.client_id = '0f99e7e0-389a-4ac9-b2ee-c4d50a2b1e91'        -- Ajio
  AND i.warehouse_id = '19a2cd92-ce29-4516-af3f-e73179e84fd2'      -- Periyapalayam
  AND i.pickup_area NOT ILIKE '%chennai%';

COMMIT;
