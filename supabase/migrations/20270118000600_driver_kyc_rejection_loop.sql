-- Driver KYC rejection → re-submission loop.
--
-- The submission gate shipped with three holes that only appear once a
-- reviewer actually presses Reject:
--
--   1. A driver rejected at the driver level had no way back into the queue —
--      the client hid the submit button whenever a submission row existed and
--      wasn't approved, so re-uploading documents led nowhere.
--   2. driver_submit_kyc_for_verification() only checked "document is not
--      rejected", so a driver-level rejection with four still-pending
--      documents could be re-queued without changing anything — a reviewer
--      would see the identical set back in their queue.
--   3. The table had an INSERT policy but no UPDATE policy. Re-submission
--      worked only because it rode ON CONFLICT DO UPDATE inside a
--      SECURITY DEFINER function; any other caller failed silently.
--
-- This migration closes all three and records attempt history so a reviewer
-- can see how many times a driver has come back.

-- ── Attempt tracking ────────────────────────────────────────────────────────
alter table public.driver_kyc_submissions
  add column if not exists attempt_count integer not null default 1;

-- Reviewer-facing history of every driver-level decision. The per-document
-- reasons live on driver_kyc_documents.rejection_notes (current state only);
-- this is the durable driver-level trail across repeated attempts.
create table if not exists public.driver_kyc_submission_events (
  id             uuid primary key default gen_random_uuid(),
  driver_user_id uuid not null references auth.users(id) on delete cascade,
  attempt        integer not null,
  event          text not null check (event in ('submitted', 'approved', 'rejected')),
  notes          text,
  actor_id       uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists driver_kyc_submission_events_driver_idx
  on public.driver_kyc_submission_events (driver_user_id, created_at desc);

alter table public.driver_kyc_submission_events enable row level security;

drop policy if exists driver_kyc_submission_events_select on public.driver_kyc_submission_events;
create policy driver_kyc_submission_events_select
  on public.driver_kyc_submission_events for select
  using (
    driver_user_id = (select auth.uid())
    or public.has_platform_permission((select auth.uid()), 'driver_kyc.review')
  );

-- ── Missing UPDATE policy (hole 3) ──────────────────────────────────────────
-- Drivers may only move their own row back into 'submitted'; they can never
-- write 'approved'. Reviewers go through the SECURITY DEFINER review RPC, so
-- they need no UPDATE policy of their own.
drop policy if exists driver_kyc_submissions_update on public.driver_kyc_submissions;
create policy driver_kyc_submissions_update
  on public.driver_kyc_submissions for update
  using (driver_user_id = (select auth.uid()))
  with check (driver_user_id = (select auth.uid()) and review_status = 'submitted');

-- ── Submit / re-submit (holes 1 + 2) ────────────────────────────────────────
-- Re-submission is allowed from 'rejected', but only once every rejected
-- document has actually been replaced. An approved driver is terminal.
create or replace function public.driver_submit_kyc_for_verification()
returns public.driver_kyc_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_missing     text;
  v_rejected    text;
  v_current     public.driver_kyc_submissions;
  v_row         public.driver_kyc_submissions;
  v_attempt     integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_current
  from public.driver_kyc_submissions
  where driver_user_id = v_uid;

  -- Approved is terminal: re-verification is a reviewer action (reject first),
  -- not something a driver can trigger by re-uploading.
  if v_current.review_status = 'approved' then
    raise exception 'Already verified — no further submission needed';
  end if;

  -- Already awaiting review: silently succeed rather than inflating the
  -- attempt count on a double-tap.
  if v_current.review_status = 'submitted' then
    return v_current;
  end if;

  -- Every mandatory type must be present.
  select string_agg(t.doc_type, ', ' order by t.doc_type)
    into v_missing
  from (values ('license'), ('aadhaar'), ('pan'), ('selfie')) as t(doc_type)
  where not exists (
    select 1
    from public.driver_kyc_documents d
    where d.driver_user_id = v_uid
      and d.doc_type = t.doc_type
      and d.deleted_at is null
      and d.storage_path is not null
  );

  if v_missing is not null then
    raise exception 'Cannot submit: missing documents (%)', v_missing;
  end if;

  -- Hole 2: nothing still carrying a rejection may be re-submitted. Replacing
  -- a file resets it to 'pending' via driver_resubmit_kyc_document, so a
  -- still-'rejected' row means the driver has not fixed it.
  select string_agg(d.doc_type, ', ' order by d.doc_type)
    into v_rejected
  from public.driver_kyc_documents d
  where d.driver_user_id = v_uid
    and d.deleted_at is null
    and d.status = 'rejected';

  if v_rejected is not null then
    raise exception 'Cannot submit: replace the rejected documents first (%)', v_rejected;
  end if;

  v_attempt := coalesce(v_current.attempt_count, 0) + 1;

  insert into public.driver_kyc_submissions as s
    (driver_user_id, submitted_at, review_status, attempt_count)
  values (v_uid, now(), 'submitted', v_attempt)
  on conflict (driver_user_id) do update
    set submitted_at  = now(),
        review_status = 'submitted',
        attempt_count = v_attempt,
        reviewed_at   = null,
        reviewed_by   = null,
        review_notes  = null,
        updated_at    = now()
  returning s.* into v_row;

  insert into public.driver_kyc_submission_events
    (driver_user_id, attempt, event, actor_id)
  values (v_uid, v_attempt, 'submitted', v_uid);

  return v_row;
end;
$$;

revoke all on function public.driver_submit_kyc_for_verification() from public;
grant execute on function public.driver_submit_kyc_for_verification() to authenticated;

-- ── Reviewer decision: require a reason on reject, log every attempt ────────
create or replace function public.platform_review_driver_kyc_submission(
  p_driver_user_id uuid,
  p_status         text,
  p_notes          text default null
)
returns public.driver_kyc_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.driver_kyc_submissions;
begin
  if not public.has_platform_permission((select auth.uid()), 'driver_kyc.review') then
    raise exception 'Not authorized: driver_kyc.review required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid status: %', p_status;
  end if;

  -- A rejection the driver cannot read is a dead end for them — the whole
  -- point of the loop is that they know what to fix.
  if p_status = 'rejected' and coalesce(trim(p_notes), '') = '' then
    raise exception 'rejection_reason_required';
  end if;

  update public.driver_kyc_submissions
     set review_status = p_status,
         review_notes  = p_notes,
         reviewed_at   = now(),
         reviewed_by   = (select auth.uid()),
         updated_at    = now()
   where driver_user_id = p_driver_user_id
  returning * into v_row;

  if v_row is null then
    raise exception 'No submission found for driver %', p_driver_user_id;
  end if;

  insert into public.driver_kyc_submission_events
    (driver_user_id, attempt, event, notes, actor_id)
  values (p_driver_user_id, v_row.attempt_count, p_status, p_notes, (select auth.uid()));

  return v_row;
end;
$$;

revoke all on function public.platform_review_driver_kyc_submission(uuid, text, text) from public;
grant execute on function public.platform_review_driver_kyc_submission(uuid, text, text) to authenticated;

-- ── Queue view: expose attempt count + blockers ─────────────────────────────
-- Dropped rather than CREATE OR REPLACE'd: adding attempt_count mid-list
-- renames existing view columns, which Postgres refuses (42P16).
drop view if exists public.driver_kyc_review_queue;

create view public.driver_kyc_review_queue
with (security_invoker = true)
as
select
  s.driver_user_id,
  d.id                                     as driver_id,
  d.name                                   as driver_name,
  d.phone                                  as driver_phone,
  o.name                                   as organization_name,
  s.submitted_at,
  s.review_status,
  s.reviewed_at,
  s.review_notes,
  s.attempt_count,
  count(k.id)                              as document_count,
  count(k.id) filter (where k.status = 'pending')  as pending_count,
  count(k.id) filter (where k.status = 'verified') as verified_count,
  count(k.id) filter (where k.status = 'rejected') as rejected_count
from public.driver_kyc_submissions s
left join public.drivers d
       on d.user_id = s.driver_user_id
left join public.organizations o
       on o.id = d.organization_id
left join public.driver_kyc_documents k
       on k.driver_user_id = s.driver_user_id
      and k.deleted_at is null
group by s.driver_user_id, d.id, d.name, d.phone, o.name,
         s.submitted_at, s.review_status, s.reviewed_at, s.review_notes,
         s.attempt_count;

grant select on public.driver_kyc_review_queue to authenticated;
