-- Named incident correction — NOT a backfill, NOT a pattern to reuse.
--
-- Background: 20270208173000_fix_tracking_only_not_employer_on_phone_link.sql
-- (already applied 2026-08-08T17:38:58 UTC) flipped tracking_only=true on 33
-- driver rows across 8 orgs whose user_id was set at the time. All 33 rows
-- subsequently lost user_id (now NULL) via a mechanism that does not match any
-- known application code path (the write did not update `updated_at`, unlike
-- every known writer of this column). That cause remains formally UNKNOWN and
-- is not resolved or referenced by this migration.
--
-- Of those 33 rows, exactly ONE — this one — has independent, positive
-- evidence contradicting its tracking_only=true / unlinked classification:
--   - driver_salary_requests row, status='paid', amount=500, request_type=
--     'reward', created 2026-07-25 — a real, completed transaction predating
--     the incident by two weeks.
--   - driver_salary_requests row, status='pending', amount=3500,
--     request_type='trip_based', referencing trip f1616486-... (TRP035).
--   - The correct user_id was independently re-derived from this driver row's
--     OWN phone number (9008008008) against public.profiles, both by exact
--     match and by a loose last-10-digit scan across every driver-role
--     profile in the database — one unambiguous match, not carried over from
--     any prior observation.
--
-- The other 32 rows touched by 20270208173000 have NO equivalent evidence and
-- are explicitly NOT touched here or by any future migration modeled on this
-- one. Their relationship_origin/relationship_status remain NULL. Do not
-- generalize this correction into a backfill rule.
--
-- tracking_only is set to false here as a temporary compatibility fix only:
-- the app's fleet-membership and compensation readers have not yet migrated
-- to relationship_status, so leaving tracking_only=true would knowingly keep
-- Sadam misrepresented in the live product. relationship_origin/
-- relationship_status are the durable source of truth going forward, not
-- tracking_only.
--
-- Depends on 20270210090000_driver_relationship_origin_and_status.sql having
-- already been applied (relationship_origin/relationship_status columns must
-- exist).

UPDATE public.drivers
SET user_id = '6e31cf96-d1ca-4bf7-87ca-1cba63c563a5',
    relationship_origin = 'phone_assignment',
    relationship_status = 'active_employee',
    tracking_only = false,
    updated_at = now()
WHERE id = '4d04bec0-da1f-443c-ae19-97a913398a92';
