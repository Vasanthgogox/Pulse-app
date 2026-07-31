-- Let a driver withdraw a rejected OPTIONAL document, and stop such documents
-- blocking submission.
--
-- Deadlock this fixes: PAN is optional, but the re-submit guard blocked on any
-- rejected document regardless of whether it was required. A driver whose
-- licence/Aadhaar/selfie were all verified and whose only rejected item was an
-- optional PAN could not re-submit and had no way to remove it — so a driver
-- with no PAN card at all (the exact case PAN was made optional for) ended up
-- permanently stuck after uploading the wrong file once.
--
-- Two changes:
--   1. driver_withdraw_kyc_document() — driver-initiated soft delete, allowed
--      only for non-mandatory doc types. Mandatory documents must be fixed, not
--      abandoned, so they remain non-withdrawable.
--   2. The submit guard now blocks only on rejected *mandatory* documents. A
--      rejected optional document is a no-op for eligibility; the reviewer sees
--      it as not-provided once withdrawn.

-- ── Driver withdraws an optional document ───────────────────────────────────
create or replace function public.driver_withdraw_kyc_document(p_document_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_doc       public.driver_kyc_documents;
  v_mandatory boolean;
begin
  select * into v_doc
  from public.driver_kyc_documents
  where id = p_document_id
    and driver_user_id = (select auth.uid())
    and deleted_at is null;

  if v_doc is null then
    raise exception 'driver_kyc_document_not_found_or_not_owned: %', p_document_id;
  end if;

  select r.is_mandatory into v_mandatory
  from public.driver_kyc_doc_requirements r
  where r.doc_type = v_doc.doc_type;

  -- Absent from the requirement list => not a required document => withdrawable.
  if coalesce(v_mandatory, false) then
    raise exception 'cannot_withdraw_mandatory_document: %', v_doc.doc_type;
  end if;

  -- Soft delete: keeps the audit trail (and any platform_events already
  -- emitted for it) intact while removing the row from every active view.
  update public.driver_kyc_documents
     set deleted_at = now(),
         updated_at = now()
   where id = p_document_id;
end;
$$;

revoke all on function public.driver_withdraw_kyc_document(uuid) from public;
grant execute on function public.driver_withdraw_kyc_document(uuid) to authenticated;

-- ── Submit: only rejected MANDATORY documents block ─────────────────────────
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

  -- Only mandatory rejections block. A rejected optional document can be
  -- re-uploaded or withdrawn; either way it must not hold the driver hostage.
  select string_agg(coalesce(r.label, d.doc_type), ', ' order by d.doc_type)
    into v_rejected
  from public.driver_kyc_documents d
  join public.driver_kyc_doc_requirements r on r.doc_type = d.doc_type
  where d.driver_user_id = v_uid
    and d.deleted_at is null
    and d.status = 'rejected'
    and r.is_mandatory;

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
