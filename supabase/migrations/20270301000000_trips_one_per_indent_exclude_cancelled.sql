-- WS6 (Gate 4, step 1 of 7): narrow trips_one_per_indent to exclude cancelled
-- trips, so a cancelled canonical trip no longer permanently occupies its
-- Indent's uniqueness slot.
--
-- trips.indent_id is NEVER nulled by this or any later WS6 migration --
-- historical lineage stays exactly as recorded. This index is the only
-- schema change needed to support release/reopen; see
-- release_and_reopen_indent() (next migration) for the explicit,
-- Business-authorized transition that actually frees an Indent for a new
-- award once its canonical trip has been cancelled.
--
-- Before: UNIQUE (indent_id) WHERE indent_id IS NOT NULL
-- After:  UNIQUE (indent_id) WHERE indent_id IS NOT NULL AND status <> 'cancelled'
--
-- Per docs/database/QUERY_GUIDE.md's live snapshot, 'cancelled' is a single,
-- unambiguous status literal in this table (unlike the 24 tolerated spellings
-- for in-transit-style statuses), so this predicate is safe to key on
-- directly without a spelling-tolerance list.

DROP INDEX IF EXISTS public.trips_one_per_indent;

CREATE UNIQUE INDEX IF NOT EXISTS trips_one_per_indent
  ON public.trips (indent_id)
  WHERE indent_id IS NOT NULL AND status <> 'cancelled';

COMMENT ON INDEX public.trips_one_per_indent IS
  'At most one non-cancelled trip per Indent. A cancelled trip retains its indent_id forever (historical lineage) but no longer occupies this slot, so release_and_reopen_indent() + a new award can create a second trip for the same Indent without ever nulling the first trip''s indent_id.';
