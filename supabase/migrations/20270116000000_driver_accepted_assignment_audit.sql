-- Record driver acceptance as a durable, server-side event.
--
-- Until now "hold to accept" on the driver app only re-wrote status = 'assigned'
-- (the status the trip already had) and stashed the trip id in the driver's local
-- AsyncStorage. Acceptance therefore existed only on that one device, so the web
-- manifest could never distinguish "dispatcher assigned it" from "driver accepted
-- it" and had to guess from trip.status.
--
-- Two things are needed for the driver's tap to persist:
--   1. 'driver_accepted' must be an allowed event_type (CHECK currently blocks it)
--   2. the driver must be allowed to INSERT — the existing INSERT policy is
--      org-member only, and a driver is generally not a member of the trip's org,
--      so their write was being silently denied by RLS.

-- 1. Widen the event_type CHECK.
alter table public.trip_assignment_audit
  drop constraint if exists trip_assignment_audit_event_type_check;

alter table public.trip_assignment_audit
  add constraint trip_assignment_audit_event_type_check
  check (event_type = any (array[
    'assignment'::text,
    'reassignment'::text,
    'driver_accepted'::text,
    'completed'::text
  ]));

-- 2. Let a driver record acceptance for a trip that is assigned to them, and only
--    that. Narrowly scoped on purpose: event_type is pinned to 'driver_accepted',
--    the trip must currently be assigned to this driver, and changed_by must be
--    the caller — so this policy cannot be used to forge assignment history.
drop policy if exists "Drivers can insert their own acceptance audit"
  on public.trip_assignment_audit;

create policy "Drivers can insert their own acceptance audit"
  on public.trip_assignment_audit
  for insert
  to authenticated
  with check (
    event_type = 'driver_accepted'
    and changed_by = (select auth.uid())
    and exists (
      select 1
      from public.trips t
      join public.drivers d
        on d.id = t.driver_id
       and d.user_id = (select auth.uid())
      where t.id = trip_assignment_audit.trip_id
    )
  );

-- 3. One acceptance per (trip, driver). Makes the driver-side write idempotent so a
--    double tap, a retry, or an offline replay cannot stack duplicate rows — the
--    manifest resolver takes the earliest row, but duplicates would still pollute
--    the audit history.
create unique index if not exists trip_assignment_audit_driver_accepted_uniq
  on public.trip_assignment_audit (trip_id, driver_id_new)
  where event_type = 'driver_accepted';
