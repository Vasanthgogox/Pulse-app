-- Backfill relationship_status for legacy fleet driver rows so own drivers
-- become visible on the Network page again.
--
-- REPORTED (both AERO trip reports)
-- "Own driver is not visible in the page." / "Own driver was not reflecting in
-- the Network page — hence, Asset Module was changed to Aggregate."
-- That forced workaround is what produced the Rs.0 driver payout fixed in
-- 3d703fec, so this row-level gap is the upstream cause of several findings.
--
-- ROOT CAUSE
-- isActiveFleetRelationshipDriver (drivers.service.ts) admits only
-- 'active_employee' and 'independent'. NULL is excluded deliberately — the
-- predicate's own doc comment records this, citing the tracking_only incident
-- cohort. The predicate is correct and is NOT changed here.
--
-- The problem is the data: 85 of 99 active driver rows predate the column and
-- still carry relationship_status = NULL, so they are filtered out of the
-- Network page, Party Directory, DriversTab, Business Pulse, driver-home
-- queries and asset-sales analytics — 20 call sites in total.
--
-- WHY THIS SPLIT
-- The 85 NULL rows are not one population:
--   * 61 rows have tracking_only = true. These are the incident cohort the
--     predicate exists to exclude — phone-assignment/tracking stubs that are
--     not fleet members. They are LEFT UNTOUCHED.
--   * 24 rows have tracking_only = false. These are genuine fleet drivers,
--     14 of them with a claimed login and 17 with completed trips, including
--     Mani (20 trips), aiman (13), Raja (7), Ajay (7), Ravi (7) and BABA at
--     AERO — the reporter's own driver. These are the ones wrongly hidden.
--
-- Backfilling only the tracking_only = false rows fixes the reported bug at its
-- source without widening the predicate, so the 20 call sites keep their current
-- semantics and the incident cohort stays excluded.
--
-- VALUE CHOSEN
-- 'active_employee' rather than 'independent': these rows were created through
-- an org's own fleet roster (tracking_only = false, no relationship_origin),
-- which is the employed-driver shape. 'independent' is reserved for drivers who
-- work across orgs, and is set explicitly by the invite/assignment flows.
--
-- SCOPE GUARDS
--   * relationship_status IS NULL — never overwrites a row that already has a
--     resolved status, so invite_accepted / phone_assignment rows are safe.
--   * tracking_only = false — never touches the 61-row incident cohort.
--   * left_at IS NULL — never resurrects a driver who has left an org.
--   * relationship_origin is deliberately NOT set. It records HOW the
--     relationship began and that is genuinely unknown for these legacy rows;
--     inventing a value would be fabricating history. Only membership is
--     restored, which is all the predicate reads.
--
-- Expected: exactly 24 rows updated. Includes 3 "Test Driver" rows in a demo
-- org; they are tracking_only = false fleet rows and are treated the same way
-- rather than excluded by a fragile name match.
--
-- REVERSIBILITY
-- Not automatically reversible: the prior value was NULL and is
-- indistinguishable afterwards from a row legitimately set to
-- 'active_employee'. The WHERE clause is narrow and the affected ids were
-- captured in review before applying.

UPDATE public.drivers
   SET relationship_status = 'active_employee',
       updated_at = now()
 WHERE relationship_status IS NULL
   AND tracking_only = false
   AND left_at IS NULL;

-- ─── Future-proofing ────────────────────────────────────────────────────────
-- A backfill alone fixes today's rows and nothing else: any new fleet driver
-- inserted without relationship_status would be invisible on the Network page
-- all over again, and the failure is silent — the row saves fine and simply
-- never appears.
--
-- Application code is already correct: createDriver sets
-- ('manual_add','independent') and ensureDriverRowByPhone sets
-- ('phone_assignment', ...). But nothing enforced it, and the column default is
-- NULL, so any new insert path, SQL console fix-up, seed script or import could
-- reintroduce the gap.
--
-- Defence in depth, both narrow enough not to change existing behaviour:
--
--   1. A column DEFAULT so an insert that omits the field lands as a visible
--      fleet member instead of an invisible NULL. Only affects inserts that
--      omit the column; every current app path passes it explicitly and is
--      therefore unaffected.
--
--   2. A CHECK constraint restricting the column to the four known states plus
--      NULL. NULL is still permitted because the 61 tracking_only rows keep it,
--      and forbidding it would break those inserts. The constraint's real job is
--      catching typos ('active-employee', 'Active_Employee', 'employee') which
--      would otherwise silently hide a driver — exactly the class of bug this
--      migration is repairing.
ALTER TABLE public.drivers
  ALTER COLUMN relationship_status SET DEFAULT 'active_employee';

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_relationship_status_check;

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_relationship_status_check
  CHECK (relationship_status IS NULL OR relationship_status IN (
    'active_employee',
    'independent',
    'disconnected',
    'superseded'
  ));

COMMENT ON COLUMN public.drivers.relationship_status IS
  'Fleet membership state. Only active_employee and independent are treated as "in the fleet" by isActiveFleetRelationshipDriver (drivers.service.ts) — a NULL or misspelled value silently hides the driver from the Network page, Party Directory, DriversTab and asset-sales analytics. Defaults to active_employee so an omitted insert fails visible rather than invisible; tracking-only stubs may still be NULL.';
