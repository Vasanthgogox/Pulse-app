-- PAN becomes optional for driver KYC.
--
-- driver_submit_kyc_for_verification() hard-coded all four doc types as
-- mandatory (license, aadhaar, pan, selfie). PAN is not universal among Indian
-- drivers — it is only needed for tax filing, and drivers below the threshold
-- routinely never apply for one. Requiring it meant those drivers could never
-- submit: the client button stayed disabled and the RPC would have refused them
-- anyway. Identity is already established by licence + Aadhaar + selfie.
--
-- The mandatory set now lives in data, not in this function body: the table's
-- existing is_mandatory column (added with the table, previously unread by any
-- caller) is the source of truth, with a reference table listing the doc types
-- the product expects. Changing the requirement later is an UPDATE, not a code
-- change — which matters because this rule has already changed once.

-- ── Reference table: which doc types exist, and which are required ───────────
create table if not exists public.driver_kyc_doc_requirements (
  doc_type     text primary key,
  label        text not null,
  is_mandatory boolean not null default true,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now()
);

insert into public.driver_kyc_doc_requirements (doc_type, label, is_mandatory, sort_order)
values
  ('license', 'Driving licence', true,  1),
  ('aadhaar', 'Aadhaar',         true,  2),
  ('pan',     'PAN',             false, 3),   -- optional: see header
  ('selfie',  'Selfie',          true,  4)
on conflict (doc_type) do update
  set label        = excluded.label,
      is_mandatory = excluded.is_mandatory,
      sort_order   = excluded.sort_order,
      updated_at   = now();

alter table public.driver_kyc_doc_requirements enable row level security;

-- Every authenticated user may read the requirement list — the driver app needs
-- it to render the checklist. Only platform staff change it.
drop policy if exists driver_kyc_doc_requirements_select on public.driver_kyc_doc_requirements;
create policy driver_kyc_doc_requirements_select
  on public.driver_kyc_doc_requirements for select
  using (true);

grant select on public.driver_kyc_doc_requirements to authenticated, anon;

-- Existing PAN rows were stamped is_mandatory = true by the table default;
-- realign them so the column agrees with the requirement list.
update public.driver_kyc_documents
   set is_mandatory = false, updated_at = now()
 where doc_type = 'pan' and is_mandatory is true;

-- ── Submit: require only the mandatory set ──────────────────────────────────
create or replace function public.driver_submit_kyc_for_verification()
returns public.driver_kyc_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_missing  text;
  v_rejected text;
  v_current  public.driver_kyc_submissions;
  v_row      public.driver_kyc_submissions;
  v_attempt  integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_current
  from public.driver_kyc_submissions
  where driver_user_id = v_uid;

  if v_current.review_status = 'approved' then
    raise exception 'Already verified - no further submission needed';
  end if;

  if v_current.review_status = 'submitted' then
    return v_current;
  end if;

  -- Mandatory set read from the requirement table, so PAN (is_mandatory =
  -- false) no longer blocks submission.
  select string_agg(r.label, ', ' order by r.sort_order)
    into v_missing
  from public.driver_kyc_doc_requirements r
  where r.is_mandatory
    and not exists (
      select 1
      from public.driver_kyc_documents d
      where d.driver_user_id = v_uid
        and d.doc_type = r.doc_type
        and d.deleted_at is null
        and d.storage_path is not null
    );

  if v_missing is not null then
    raise exception 'Cannot submit: missing documents (%)', v_missing;
  end if;

  -- Any document still carrying a rejection blocks re-submission — including
  -- an optional one. If PAN was uploaded and rejected, it must be fixed or the
  -- reviewer sees the same bad file again.
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

-- ── Queue view: surface optional-doc absence to the reviewer ─────────────────
-- "PAN not provided" is a legitimate end state, not a gap to chase — the
-- reviewer needs to see the difference between that and a missing mandatory doc.
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
  count(k.id) filter (where k.status = 'rejected') as rejected_count,
  (
    select string_agg(r.label, ', ' order by r.sort_order)
    from public.driver_kyc_doc_requirements r
    where not r.is_mandatory
      and not exists (
        select 1 from public.driver_kyc_documents dk
        where dk.driver_user_id = s.driver_user_id
          and dk.doc_type = r.doc_type
          and dk.deleted_at is null
          and dk.storage_path is not null
      )
  )                                        as optional_not_provided
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
