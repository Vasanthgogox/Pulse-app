-- Driver KYC "submit for verification" gate + admin review queue.
--
-- Before this, every uploaded document went straight to 'pending' and the
-- admin side had no notion of a driver being *done* uploading — a half-filled
-- set looked identical to a complete one. This adds an explicit submission
-- record the driver creates once all mandatory documents are uploaded, and a
-- view that gives the admin console the driver identity (name/phone/org) the
-- raw per-document table cannot supply on its own.

-- ── Submission record (one row per driver, latest submission wins) ───────────
create table if not exists public.driver_kyc_submissions (
  driver_user_id   uuid primary key references auth.users(id) on delete cascade,
  submitted_at     timestamptz not null default now(),
  -- 'submitted' → awaiting review, 'approved'/'rejected' → reviewed outcome.
  review_status    text not null default 'submitted'
                     check (review_status in ('submitted', 'approved', 'rejected')),
  reviewed_at      timestamptz,
  reviewed_by      uuid references auth.users(id),
  review_notes     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists driver_kyc_submissions_status_idx
  on public.driver_kyc_submissions (review_status, submitted_at desc);

alter table public.driver_kyc_submissions enable row level security;

-- Driver reads own submission; platform reviewers read all.
drop policy if exists driver_kyc_submissions_select on public.driver_kyc_submissions;
create policy driver_kyc_submissions_select
  on public.driver_kyc_submissions for select
  using (
    driver_user_id = (select auth.uid())
    or public.has_platform_permission((select auth.uid()), 'driver_kyc.review')
  );

-- Drivers submit only for themselves. Re-submission goes through the RPC below
-- (it must re-validate completeness), so no direct UPDATE policy exists —
-- mirroring how driver_kyc_documents deliberately withholds UPDATE.
drop policy if exists driver_kyc_submissions_insert on public.driver_kyc_submissions;
create policy driver_kyc_submissions_insert
  on public.driver_kyc_submissions for insert
  with check (driver_user_id = (select auth.uid()));

-- ── Driver-facing: submit for verification ──────────────────────────────────
-- Validates that every mandatory doc type is present before allowing submit,
-- so the admin queue never receives a partial set. Idempotent: re-submitting
-- after a rejection resets the row to 'submitted'.
create or replace function public.driver_submit_kyc_for_verification()
returns public.driver_kyc_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_missing text;
  v_row     public.driver_kyc_submissions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Mandatory set is fixed by product definition (license/aadhaar/pan/selfie),
  -- matching the driver Documents screen's DOC_DEFS.
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
      and d.status <> 'rejected'
  );

  if v_missing is not null then
    raise exception 'Cannot submit: missing or rejected documents (%)', v_missing;
  end if;

  insert into public.driver_kyc_submissions as s (driver_user_id, submitted_at, review_status)
  values (v_uid, now(), 'submitted')
  on conflict (driver_user_id) do update
    set submitted_at  = now(),
        review_status = 'submitted',
        reviewed_at   = null,
        reviewed_by   = null,
        review_notes  = null,
        updated_at    = now()
  returning s.* into v_row;

  return v_row;
end;
$$;

revoke all on function public.driver_submit_kyc_for_verification() from public;
grant execute on function public.driver_submit_kyc_for_verification() to authenticated;

-- ── Admin-facing: overall submission decision ───────────────────────────────
-- Per-document approve/reject already exist (platform_approve_driver_kyc_document
-- / platform_reject_driver_kyc_document). This records the driver-level outcome.
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

  return v_row;
end;
$$;

revoke all on function public.platform_review_driver_kyc_submission(uuid, text, text) from public;
grant execute on function public.platform_review_driver_kyc_submission(uuid, text, text) to authenticated;

-- ── Admin review queue ──────────────────────────────────────────────────────
-- The raw documents table only carries driver_user_id; the console needs a
-- name and phone to be usable. security_invoker keeps the caller's RLS in
-- force, so this exposes nothing a reviewer could not already select.
create or replace view public.driver_kyc_review_queue
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
         s.submitted_at, s.review_status, s.reviewed_at, s.review_notes;

grant select on public.driver_kyc_review_queue to authenticated;

-- Realtime so the console updates as drivers submit.
alter publication supabase_realtime add table public.driver_kyc_submissions;
