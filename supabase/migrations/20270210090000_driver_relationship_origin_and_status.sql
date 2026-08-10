-- Driver relationship model — Phase 1 (additive schema only).
--
-- Context: investigation into a driver (Sadam / TRP035) whose drivers.tracking_only
-- and drivers.user_id changed unexpectedly showed that `tracking_only` has been
-- overloaded with at least three unrelated meanings over time (aggregate
-- phone-assignment stub, superseded/duplicate row from a reconnect, and
-- "no invite + no payout terms" inferred non-employer). An uncommitted migration
-- (20270208173000_fix_tracking_only_not_employer_on_phone_link.sql, Statement 3)
-- attempted to resolve this by inferring relationship type from the ABSENCE of a
-- driver_invites row — which produced a false positive on a real, working driver
-- relationship. That statement is NOT applied here or anywhere by this migration.
--
-- This migration introduces two new, narrowly-scoped columns that separate two
-- concepts that were colliding inside `tracking_only`:
--
--   relationship_origin — HOW this driver row originated. Write-once at row
--     creation. Never updated later by inference from current state.
--
--   relationship_status — WHAT the driver's current primary relationship with
--     THIS organisation is. Event-driven only (invite accepted, driver leaves,
--     tenure-dedup finds a superseded row). Never inferred from absence of
--     related data (no invites, no payout terms, etc.).
--
-- Explicitly out of scope for this migration:
--   - No backfill. Every existing row gets NULL for both columns — including
--     Sadam's row. Provenance cannot be proven retroactively for rows that
--     predate this column, so it is left honestly unknown rather than guessed.
--   - No change to drivers.tracking_only (value or meaning) — existing writers
--     and readers of tracking_only are completely unaffected by this migration.
--   - No reader or writer migration — nothing yet queries or sets these columns.
--     They are populated by application code in a later phase.
--   - No marketplace_only / owner_operator values — those describe capabilities
--     that haven't been designed yet; adding them now would be schema for
--     hypothetical behavior.
--   - No relationship to compensation. relationship_status = 'active_employee'
--     does not imply agreed compensation, and 'independent' does not imply its
--     absence — compensation eligibility remains decided solely by the existing
--     resolveDriverTripPayoutTerms() / tripEarningsDetailForDriver() logic in
--     features/drivers/utils/driverUtils.util.ts, which this migration does not
--     touch.
--   - No relationship to drivers.user_id. The unexplained user_id -> NULL
--     mutation on Sadam's row remains a separate, unresolved investigation and
--     is not addressed or referenced by this schema change.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS relationship_origin text
    CONSTRAINT drivers_relationship_origin_check
    CHECK (relationship_origin IN ('phone_assignment', 'invite_accepted', 'manual_add', 'unknown'));

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS relationship_status text
    CONSTRAINT drivers_relationship_status_check
    CHECK (relationship_status IN ('active_employee', 'independent', 'disconnected', 'superseded'));

COMMENT ON COLUMN public.drivers.relationship_origin IS
  'How this driver row originated (phone_assignment | invite_accepted | manual_add | unknown). Write-once at row creation; never updated by inference from later state. NULL for rows that predate this column — do not backfill by guessing.';

COMMENT ON COLUMN public.drivers.relationship_status IS
  'Current primary relationship with THIS organisation only (active_employee | independent | disconnected | superseded). Event-driven (invite accepted / leave_fleet / tenure-dedup superseded), never inferred from absence of driver_invites or payout terms. Independent of compensation eligibility, trip assignment mode, and marketplace capability — those remain separate concepts. NULL for rows that predate this column — do not backfill by guessing.';
