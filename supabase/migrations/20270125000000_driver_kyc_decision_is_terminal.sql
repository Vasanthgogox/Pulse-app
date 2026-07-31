-- Make a driver KYC decision terminal, and give reversal its own explicit door.
--
-- The console kept live "Approve driver" / "Reject driver" buttons up after a
-- driver was already decided, and platform_review_driver_kyc_submission had no
-- terminal-state guard, so clicking them silently overwrote a finished review.
-- Verified by attempting it (rolled back): an APPROVED driver flipped straight
-- to 'rejected' with no warning and no trace that they had ever been approved
-- beyond the events table.
--
-- Two problems, fixed separately:
--   1. UI implied the review was still open. Fixed in DriverKycPanel.tsx.
--   2. The server allowed the silent overwrite at all. Fixed here — the UI
--      cannot be the only thing standing between a verified driver and an
--      accidental un-approval.
--
-- Reversal is legitimate (fraud found after approval, reviewer error), so it is
-- not forbidden — it is separated into driver_kyc_reopen_submission(), which
-- requires a reason and writes a 'reopened' event. Deliberate two-step instead
-- of a one-click overwrite.

-- ── 0. Allow 'reopened' in the audit trail ──────────────────────────────────
-- The event check constraint only permitted submitted/approved/rejected, so
-- logging a reopen would have failed the insert and aborted the whole reopen.
alter table public.driver_kyc_submission_events
  drop constraint if exists driver_kyc_submission_events_event_check;
alter table public.driver_kyc_submission_events
  add constraint driver_kyc_submission_events_event_check
  check (event = any (array['submitted', 'approved', 'rejected', 'reopened']));

-- ── 1. Re-review of a decided submission must be explicit ───────────────────
CREATE OR REPLACE FUNCTION public.platform_review_driver_kyc_submission(
  p_driver_user_id uuid,
  p_status text,
  p_notes text DEFAULT NULL::text
)
RETURNS driver_kyc_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_row     public.driver_kyc_submissions;
  v_current text;
begin
  if not public.can_review_driver_kyc() then
    raise exception 'unauthorized: driver_kyc.review permission required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid status: %', p_status;
  end if;

  if p_status = 'rejected' and coalesce(trim(p_notes), '') = '' then
    raise exception 'rejection_reason_required';
  end if;

  select review_status into v_current
    from public.driver_kyc_submissions
   where driver_user_id = p_driver_user_id
     for update;

  if v_current is null then
    raise exception 'No submission found for driver %', p_driver_user_id;
  end if;

  -- Terminal: reopen first. Guards against a stale console tab acting on a
  -- decision someone else already made, as well as a double-click.
  if v_current in ('approved', 'rejected') then
    raise exception 'already_reviewed: driver is % — reopen the review to change it', v_current;
  end if;

  update public.driver_kyc_submissions
     set review_status = p_status,
         review_notes  = p_notes,
         reviewed_at   = now(),
         reviewed_by   = (select auth.uid()),
         updated_at    = now()
   where driver_user_id = p_driver_user_id
  returning * into v_row;

  insert into public.driver_kyc_submission_events
    (driver_user_id, attempt, event, notes, actor_id)
  values (p_driver_user_id, v_row.attempt_count, p_status, p_notes, (select auth.uid()));

  return v_row;
end;
$function$;

revoke all on function public.platform_review_driver_kyc_submission(uuid, text, text) from public;
grant execute on function public.platform_review_driver_kyc_submission(uuid, text, text)
  to authenticated, service_role;

-- ── 2. Reopening a decided review ───────────────────────────────────────────
-- Returns the driver to 'submitted' (the awaiting queue) without touching
-- attempt_count — reopening is the reviewer changing their mind, not the driver
-- making a new attempt, and conflating the two would misreport how many times
-- the driver actually re-applied.
CREATE OR REPLACE FUNCTION public.driver_kyc_reopen_submission(
  p_driver_user_id uuid,
  p_reason text
)
RETURNS driver_kyc_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_row     public.driver_kyc_submissions;
  v_current text;
begin
  if not public.can_review_driver_kyc() then
    raise exception 'unauthorized: driver_kyc.review permission required';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reopen_reason_required';
  end if;

  select review_status into v_current
    from public.driver_kyc_submissions
   where driver_user_id = p_driver_user_id
     for update;

  if v_current is null then
    raise exception 'No submission found for driver %', p_driver_user_id;
  end if;

  if v_current not in ('approved', 'rejected') then
    raise exception 'not_decided: driver is % — nothing to reopen', v_current;
  end if;

  update public.driver_kyc_submissions
     set review_status = 'submitted',
         review_notes  = p_reason,
         reviewed_at   = null,
         reviewed_by   = null,
         updated_at    = now()
   where driver_user_id = p_driver_user_id
  returning * into v_row;

  -- Keeps the prior decision legible: the events table is the only place the
  -- earlier approve/reject survives once review_status is overwritten.
  insert into public.driver_kyc_submission_events
    (driver_user_id, attempt, event, notes, actor_id)
  values (
    p_driver_user_id,
    v_row.attempt_count,
    'reopened',
    format('reopened from %s: %s', v_current, trim(p_reason)),
    (select auth.uid())
  );

  return v_row;
end;
$function$;

revoke all on function public.driver_kyc_reopen_submission(uuid, text) from public;
grant execute on function public.driver_kyc_reopen_submission(uuid, text)
  to authenticated, service_role;
