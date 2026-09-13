-- Phase 1: multi-stop execution foundation (schema/domain only).
--
-- Extends the existing Commerce planning schema so it can become the
-- canonical operational stop model, adds the Core-side link from an indent
-- to its originating execution plan, and introduces trip-specific stop
-- execution state. No Commerce publishing, orchestrator, or Driver App
-- code is wired to this yet — that is explicitly deferred to later phases.
--
-- Everything here is additive: every new column is nullable (or has a
-- constant DEFAULT applied by Postgres to existing rows at ALTER time,
-- which is metadata-only, not a data rewrite). No existing row is backfilled
-- or rewritten. No existing table's previous columns, constraints, or RLS
-- policies are removed or narrowed.

-- ── 1. execution_plan_stops: loosen warehouse_id, add location snapshot ──────
--
-- Today every stop is warehouse-only (warehouse_id NOT NULL, FK to
-- client_warehouses). That is too narrow to represent a customer or
-- supplier address, or a one-off manual location. We loosen warehouse_id to
-- nullable and add a small set of snapshot fields captured once at
-- stop-creation time. source_id is deliberately NOT a foreign key — the
-- table it points to varies by source_type (clients, suppliers, or nothing
-- for a manual entry), and the snapshot fields (not a live join) are the
-- operational truth from that point on, so a later edit to the source
-- record must never change an already-planned/executed stop.

ALTER TABLE public.execution_plan_stops
  ALTER COLUMN warehouse_id DROP NOT NULL;

ALTER TABLE public.execution_plan_stops
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'warehouse',
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

-- Existing-data safety: every row created by the current Commerce code path
-- (oms/src/lib/services/execution-plans.service.ts) always sets warehouse_id
-- and never source_type/source_id (those columns did not exist until this
-- migration). The DEFAULT 'warehouse' above is applied by Postgres to every
-- existing row automatically — it is not a backfill statement we wrote, and
-- it is factually correct for 100% of current rows, since no other
-- source_type has ever existed. source_id stays NULL on every existing row
-- (no default), which is exactly the value the constraint below requires
-- for source_type = 'warehouse'. No existing row can violate the new CHECK.
--
-- The new snapshot fields (display_name/address_line/city/state/pincode/
-- latitude/longitude) are left NULL on existing rows rather than backfilled
-- from the joined warehouse — per instruction, no existing data is rewritten.
-- Populating them for new inserts is an application-layer responsibility for
-- the next phase, not enforced by this migration's CHECK constraint (see
-- below for why).

-- Exact CHECK expression (printed before being applied, per instruction):
--
--   (source_type = 'warehouse' AND warehouse_id IS NOT NULL AND source_id IS NULL)
--   OR (source_type = 'client'   AND warehouse_id IS NULL AND source_id IS NOT NULL)
--   OR (source_type = 'supplier' AND warehouse_id IS NULL AND source_id IS NOT NULL)
--   OR (source_type = 'manual'   AND warehouse_id IS NULL AND source_id IS NULL)
--
-- Only these four source types are valid (an unrecognized source_type value
-- matches none of the four branches, so the whole disjunction is FALSE and
-- the insert/update is rejected — no separate IN-list check is needed).
-- display_name is intentionally NOT required by this DB-level constraint:
-- it must stay nullable so existing rows (which have never had a value for
-- it) remain valid without a backfill; requiring it for new manual-type
-- stops is an application-layer validation to add when that path is built.

ALTER TABLE public.execution_plan_stops
  ADD CONSTRAINT execution_plan_stops_source_check CHECK (
    (source_type = 'warehouse' AND warehouse_id IS NOT NULL AND source_id IS NULL)
    OR (source_type = 'client'   AND warehouse_id IS NULL AND source_id IS NOT NULL)
    OR (source_type = 'supplier' AND warehouse_id IS NULL AND source_id IS NOT NULL)
    OR (source_type = 'manual'   AND warehouse_id IS NULL AND source_id IS NULL)
  );

COMMENT ON COLUMN public.execution_plan_stops.source_type IS
  'Discriminator for where this stop''s location snapshot came from: warehouse | client | supplier | manual. Determines which of warehouse_id/source_id is populated (see execution_plan_stops_source_check).';
COMMENT ON COLUMN public.execution_plan_stops.source_id IS
  'Traceability only — NOT a foreign key (the referenced table varies by source_type: clients, suppliers; NULL for warehouse [warehouse_id is the reference] and manual). The snapshot fields on this row, not a live join to this id, are the operational truth.';
COMMENT ON COLUMN public.execution_plan_stops.display_name IS
  'Execution-time snapshot of the stop''s display label. Nullable for backward compatibility with rows created before this column existed; required at the application layer for new non-warehouse stops.';
COMMENT ON COLUMN public.execution_plan_stops.address_line IS 'Execution-time address snapshot. Immutable once set — later edits to the source record (warehouse/client/supplier) must not change history.';
COMMENT ON COLUMN public.execution_plan_stops.city IS 'Execution-time address snapshot, see address_line.';
COMMENT ON COLUMN public.execution_plan_stops.state IS 'Execution-time address snapshot, see address_line.';
COMMENT ON COLUMN public.execution_plan_stops.pincode IS 'Execution-time address snapshot, see address_line.';
COMMENT ON COLUMN public.execution_plan_stops.latitude IS 'Execution-time coordinate snapshot. Nullable — not every source (client/supplier/manual) reliably has coordinates today.';
COMMENT ON COLUMN public.execution_plan_stops.longitude IS 'Execution-time coordinate snapshot, see latitude.';

-- ── 2. indents.execution_plan_id: link a Core indent to its origin plan ─────
--
-- Nullable and unique: at most one indent per plan, but native/non-Commerce
-- indents (the overwhelming majority today) have no plan at all. The
-- existing indents.sales_order_id is untouched and keeps its current
-- meaning for the single-order publish path; for a genuinely merged
-- (multi-order) plan, sales_order_id stays NULL on the indent — a single
-- scalar FK cannot represent "orders A+B+C", and the real multi-order
-- relationship is already expressible via
-- execution_plan_id -> shipment_allocations -> sales_order_lines -> sales_orders.

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS execution_plan_id uuid REFERENCES public.execution_plans(id);

CREATE UNIQUE INDEX IF NOT EXISTS indents_execution_plan_id_unique
  ON public.indents (execution_plan_id)
  WHERE execution_plan_id IS NOT NULL;

COMMENT ON COLUMN public.indents.execution_plan_id IS
  'Origin Commerce execution plan, if this indent was created from a published multi-stop plan. NULL for native/single-order indents. At most one indent per plan (partial unique index, NULLs excluded). sales_order_id is left NULL on a merged multi-order indent; the real order linkage for that case is execution_plan_id -> shipment_allocations -> sales_order_lines -> sales_orders.';

-- ── 3. stop_execution_state: trip-specific mutable execution state ──────────
--
-- Deliberately does NOT duplicate the stop definition (location, sequence
-- source, contact info, pod_required) — those stay on execution_plan_stops,
-- the single canonical stop record. This table only tracks what changes as
-- a specific trip executes a specific stop.
--
-- No organization_id column here by design: org scoping for RLS is derived
-- via trips.organization_id (this table is always reached through a trip),
-- avoiding a redundant, independently-writable copy of the org id.
--
-- Deliberately excludes started_at, departed_at, and metadata — none of
-- these are justified by any currently-existing Driver App behavior (traced
-- in the design audit); adding them speculatively was explicitly rejected.
--
-- Known, deferred integrity gap (reported per instruction rather than
-- solved with a trigger): nothing in this migration enforces that a given
-- stop_execution_state row's stop_id actually belongs to the same
-- execution_plan_id as the indent behind its trip_id. That cross-table
-- consistency cannot be expressed as a plain CHECK constraint (CHECK cannot
-- reference other tables), and a trigger was explicitly out of scope for
-- this phase. This must be enforced at the application/orchestrator layer
-- when stop_execution_state rows are actually created (Phase 2+), not here.

CREATE TABLE IF NOT EXISTS public.stop_execution_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  stop_id uuid NOT NULL REFERENCES public.execution_plan_stops(id),
  sequence integer NOT NULL,
  driver_id uuid REFERENCES public.drivers(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'arrived', 'completed', 'skipped', 'failed')),
  arrived_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  skip_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stop_execution_state_trip_stop_unique UNIQUE (trip_id, stop_id)
);

CREATE INDEX IF NOT EXISTS idx_stop_execution_state_trip_id ON public.stop_execution_state (trip_id);
CREATE INDEX IF NOT EXISTS idx_stop_execution_state_stop_id ON public.stop_execution_state (stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_execution_state_driver_id ON public.stop_execution_state (driver_id);

-- Reuse the existing generic updated_at trigger convention (already used by,
-- e.g., set_trips_updated_at on public.trips) rather than inventing a new one.
CREATE TRIGGER set_stop_execution_state_updated_at
  BEFORE UPDATE ON public.stop_execution_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.stop_execution_state IS
  'Trip-specific mutable execution state for one stop of one trip. The stop DEFINITION (location, sequence, type, contact info) stays on execution_plan_stops, the single canonical stop record — this table never duplicates it, only tracks per-trip progress against it.';
COMMENT ON COLUMN public.stop_execution_state.sequence IS
  'Snapshot of the stop''s planning-time sequence, captured when this row is created, so a later edit to execution_plan_stops.sequence cannot silently reorder a trip already in progress.';
COMMENT ON COLUMN public.stop_execution_state.failure_reason IS 'Set when status = failed. Free text, audit trail only.';
COMMENT ON COLUMN public.stop_execution_state.skip_reason IS 'Set when status = skipped. Free text, audit trail only.';

ALTER TABLE public.stop_execution_state ENABLE ROW LEVEL SECURITY;

-- Dispatcher / org member: read and manage stop execution state for trips
-- belonging to their organization, mirroring the is_org_member(...) pattern
-- already used throughout Core RLS (organization_id is reached via trips,
-- since this table has no organization_id column of its own by design).
CREATE POLICY stop_execution_state_org_select ON public.stop_execution_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = stop_execution_state.trip_id
        AND public.is_org_member(t.organization_id)
    )
  );

CREATE POLICY stop_execution_state_org_manage ON public.stop_execution_state
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = stop_execution_state.trip_id
        AND public.is_org_member(t.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = stop_execution_state.trip_id
        AND public.is_org_member(t.organization_id)
    )
  );

-- Driver: read and update ONLY rows belonging to their own assigned trip —
-- exact same shape as the existing drivers_update_own_trip_status policy on
-- public.trips.
CREATE POLICY stop_execution_state_driver_select ON public.stop_execution_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.drivers d ON d.id = t.driver_id
      WHERE t.id = stop_execution_state.trip_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY stop_execution_state_driver_update ON public.stop_execution_state
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.drivers d ON d.id = t.driver_id
      WHERE t.id = stop_execution_state.trip_id
        AND d.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.drivers d ON d.id = t.driver_id
      WHERE t.id = stop_execution_state.trip_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

-- ── 4. execution_plan_stops: narrow driver read access ───────────────────────
--
-- Additive only — the existing execution_plan_stops_select policy
-- (is_org_member(organization_id)) is untouched. Postgres OR's multiple
-- permissive policies together for the same command, so this only WIDENS
-- access (to a driver's own stops, reached only through their own trip's
-- stop_execution_state rows), never narrows the existing org-member policy.
-- Drivers do NOT get unrestricted organization-wide access to all stops.

CREATE POLICY execution_plan_stops_driver_select ON public.execution_plan_stops
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.stop_execution_state ses
      JOIN public.trips t ON t.id = ses.trip_id
      JOIN public.drivers d ON d.id = t.driver_id
      WHERE ses.stop_id = execution_plan_stops.id
        AND d.user_id = (SELECT auth.uid())
    )
  );

-- ── 5. trip_documents.stop_id: POD-to-stop association ───────────────────────
--
-- Nullable, additive. NULL continues to mean exactly what it means today —
-- a whole-trip POD, not associated with any particular stop. No order_id/
-- order_line_id/allocation_id columns are added here: that relationship is
-- already walkable via stop_id -> shipment_allocations (pickup_stop_id or
-- drop_stop_id) -> sales_order_lines, and duplicating it would be a second,
-- redundant path to the same data.

ALTER TABLE public.trip_documents
  ADD COLUMN IF NOT EXISTS stop_id uuid REFERENCES public.execution_plan_stops(id);

CREATE INDEX IF NOT EXISTS idx_trip_documents_stop_id ON public.trip_documents (stop_id);

COMMENT ON COLUMN public.trip_documents.stop_id IS
  'Optional association to the specific stop this document (e.g. a POD photo) belongs to. NULL means a whole-trip document, exactly as before this column existed — no existing behavior changes. Order/order-line context is reached via stop_id -> shipment_allocations -> sales_order_lines, not duplicated here.';
