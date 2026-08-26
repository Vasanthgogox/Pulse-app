-- Pre-OTP decline: a driver assigned by phone (drivers.user_id IS NULL, awaiting
-- OTP claim) has no way to decline the assignment today. driver_reject_trip()
-- authorizes via `d.user_id = auth.uid()`, which can never match for a
-- not-yet-claimed driver (NULL = anything is never TRUE in SQL) — confirmed
-- live against TRP001. The existing app UI (handleAcceptMission) already
-- special-cases this exact pre-claim state for Accept (diverting to the OTP
-- claim flow instead of the direct-accept path); Decline was simply never
-- given the equivalent treatment.
--
-- driver_reject_trip() is NOT modified — it remains correctly scoped to
-- already-claimed drivers (drivers.user_id = auth.uid()), exactly as
-- originally designed in 20260522120000_driver_reject_trip_rpc.sql.
--
-- This migration adds a separate, narrowly-scoped RPC for the pre-claim case,
-- authorized the same way every other pre-claim action in this codebase
-- already is (claim_trip_by_otp, get_pending_otp_trips): match the
-- authenticated caller's own registered phone number (via profiles /
-- auth.users, normalised with the existing normalise_phone() helper) against
-- drivers.phone_normalised on the trip's pre-assigned driver row. NOT
-- trip.driver_id, NOT drivers.user_id, NOT a client-supplied phone — the
-- server resolves both the caller's identity (auth.uid()) and the assigned
-- driver (via trips.driver_id) itself.
--
-- 1. Widen the event_type CHECK so this can be recorded distinctly from a
--    dispatcher reassignment or an already-accepted driver backing out —
--    "declined before ever claiming" is a materially different fact for the
--    dispatcher's Activity Log. Same additive pattern as the driver_accepted
--    widening in 20270116000000_driver_accepted_assignment_audit.sql.
alter table public.trip_assignment_audit
  drop constraint if exists trip_assignment_audit_event_type_check;

alter table public.trip_assignment_audit
  add constraint trip_assignment_audit_event_type_check
  check (event_type = any (array[
    'assignment'::text,
    'reassignment'::text,
    'driver_accepted'::text,
    'completed'::text,
    'declined_pending'::text
  ]));

-- 2. The RPC itself. SECURITY DEFINER (existing convention) so it can insert
--    into trip_assignment_audit despite RLS on that table being scoped to
--    org members / already-linked drivers (neither of which a pre-claim
--    driver is) — same pattern driver_reject_trip() already uses.
--
--    Atomicity / TOCTOU: the driver_id=NULL update and the OTP invalidation
--    both happen inside this one function's single implicit transaction, with
--    the phone-match check re-verified against the row read at the top of the
--    function (not a client-supplied value) — no separate client round trips,
--    no window where a concurrent claim/reassignment could race the decision.
--    If another request has already claimed the trip
--    (drivers.user_id becomes non-null) or reassigned it (trips.driver_id
--    changes) between this function starting and its UPDATE, the UPDATE's
--    own WHERE clause (driver_id = v_driver_id_prev, re-checked) means a
--    concurrent claim simply causes this call to affect 0 rows and return a
--    clear "already claimed" error instead of silently clobbering the new
--    state.
create or replace function public.driver_decline_pending_assignment(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_driver_id_prev uuid;
  v_driver_user_id uuid;
  v_driver_phone_norm text;
  v_claimant_phone text;
  v_normalized_claimant text;
  v_updated int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select t.driver_id, d.user_id, d.phone_normalised
  into v_driver_id_prev, v_driver_user_id, v_driver_phone_norm
  from public.trips t
  join public.drivers d on d.id = t.driver_id
  where t.id = p_trip_id;

  if v_driver_id_prev is null then
    return jsonb_build_object('ok', false, 'error', 'Trip not found or no driver assigned');
  end if;

  -- Already claimed: this RPC is pre-claim only. driver_reject_trip() owns
  -- the claimed-driver decline path — do not let this one touch it.
  if v_driver_user_id is not null then
    return jsonb_build_object('ok', false, 'error', 'This trip has already been claimed. Use the standard decline action.');
  end if;

  if v_driver_phone_norm is null or length(v_driver_phone_norm) < 10 then
    return jsonb_build_object('ok', false, 'error', 'Assigned driver has no registered phone to verify against');
  end if;

  -- Same phone-resolution pattern as claim_trip_by_otp() / get_pending_otp_trips():
  -- profiles.phone, then auth.users.phone, then raw_user_meta_data->>'phone'.
  select coalesce(
    nullif(trim(p.phone), ''),
    nullif(trim(u.phone::text), ''),
    nullif(trim(u.raw_user_meta_data->>'phone'), '')
  )
  into v_claimant_phone
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_uid;

  v_normalized_claimant := public.normalise_phone(v_claimant_phone);

  if length(coalesce(v_normalized_claimant, '')) < 10 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Only the driver with the registered mobile number can decline this assignment. Add your phone in profile or sign in with that number.'
    );
  end if;

  if v_normalized_claimant <> v_driver_phone_norm then
    return jsonb_build_object(
      'ok', false,
      'error', 'Only the driver with the registered mobile number can decline this assignment.'
    );
  end if;

  -- Unassign. WHERE re-checks driver_id = v_driver_id_prev (the row read
  -- above) so a concurrent claim/reassignment between the SELECT and here
  -- causes 0 rows affected rather than clobbering new state.
  update public.trips
  set driver_id = null, updated_at = now()
  where id = p_trip_id
    and driver_id = v_driver_id_prev;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'Trip was already claimed or reassigned. Try again.');
  end if;

  -- Invalidate the OTP so it cannot later claim the declined assignment.
  -- trip_otps.trip_id is unique (one row per trip; generate_trip_otp upserts
  -- in place) — mark used_at rather than delete, preserving history exactly
  -- like claim_trip_by_otp()'s own consumption does.
  update public.trip_otps
  set used_at = now()
  where trip_id = p_trip_id
    and used_at is null;

  begin
    insert into public.trip_assignment_audit (
      trip_id,
      event_type,
      driver_id_prev,
      driver_id_new,
      vehicle_id_prev,
      vehicle_id_new,
      changed_by
    ) values (
      p_trip_id,
      'declined_pending',
      v_driver_id_prev,
      null,
      null,
      null,
      v_uid
    );
  exception
    when undefined_table then
      null;
  end;

  return jsonb_build_object('ok', true, 'trip_id', p_trip_id, 'driver_id_prev', v_driver_id_prev);
end;
$function$;

revoke all on function public.driver_decline_pending_assignment(uuid) from public;
grant execute on function public.driver_decline_pending_assignment(uuid) to authenticated;
grant execute on function public.driver_decline_pending_assignment(uuid) to service_role;

comment on function public.driver_decline_pending_assignment(uuid) is
  'Driver declines a phone-assigned trip before OTP claim (drivers.user_id IS NULL). Authorizes via the caller''s own registered phone matching drivers.phone_normalised — NOT drivers.user_id (always NULL pre-claim) and NOT a client-supplied phone. Clears trips.driver_id, invalidates the trip''s OTP, records a declined_pending audit row. Already-claimed drivers must use driver_reject_trip() instead.';
