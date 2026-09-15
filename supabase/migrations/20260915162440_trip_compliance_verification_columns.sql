-- Trip Compliance + Finance parallel workflow — minimal schema addition.
--
-- Per the Phase 0 data-model audit, everything else this feature needs
-- (advance/balance tagging, workspace toggle, RBAC, trip cards) reuses
-- existing tables/columns with zero migration. Only two genuine gaps exist:
--
--   1. `trip_documents` has no verification-state concept at all today.
--      This mirrors the existing `entity_documents.status` pattern (KYC/fleet
--      compliance) exactly — typed columns for current state, history goes
--      into the already-existing `document_audit_log` table (its
--      `entity_type` is free text and `action` already includes
--      'verified'/'rejected', so no change is needed there).
--   2. Hard-copy POD (courier/AWB/received-by) has no home. `trips.pod_received_at`
--      already carries the received-date; we add the remaining 3 fields
--      alongside it rather than inventing a second POD table.
--
-- No new tables. No jsonb. Explicitly rejected: a `trip_compliance` sidecar
-- table (the "compliance verified" action fits as 2 columns on `trips`,
-- same convention as `pod_received_at`) and event-log-only state derivation
-- (ruled out in the audit: `workspace_audit_log` is admin-only RLS and
-- unindexed for per-document lookups; `trip_status_audit` is a fixed-shape
-- trigger table wired only to `trips.status`).

-- ── 1. Document verification (trip_documents) ──────────────────────────────

alter table public.trip_documents
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text;

comment on column public.trip_documents.status is
  'Compliance verification state — parallel to Core Trip execution, never gates it. History in document_audit_log.';

-- Widen the document_type catalog for the two compliance-required document
-- kinds that didn't previously need to be uploaded as trip_documents.
alter table public.trip_documents drop constraint if exists trip_documents_document_type_check;
alter table public.trip_documents add constraint trip_documents_document_type_check
  check (document_type in (
    'manifest', 'pod', 'invoice', 'eway_bill', 'loading_slip',
    'odometer_start_photo', 'odometer_end_photo', 'fuel_bill_photo',
    'toll_receipt_photo', 'trip_expense_receipt_photo', 'lr',
    'insurance', 'rc'
  ));

-- RLS on trip_documents itself is unchanged (any active org member except
-- ground_ops can still UPDATE the row — needed for the non-compliance
-- columns other flows already write). That is too coarse for compliance
-- verification specifically, so the three mutations unique to this feature
-- go through SECURITY DEFINER RPCs that check the actual MemberSurfaceId
-- grant server-side — closing exactly the gap the spec calls out ("must be
-- denied server-side, not merely hidden in UI"). The app's write service
-- calls these RPCs; it no longer writes trip_documents/trips directly for
-- verification, mark-verified, or hard-copy-POD.

-- ── 3. Server-side surface-grant check (generic, reusable) ─────────────────
-- Same shape as the existing public.can_create_indent() precedent
-- (20270212010000_indents_create_permission_rls.sql), parameterized by
-- surface id instead of one function per surface.

create or replace function public.has_member_surface(p_org_id uuid, p_surface_id text)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_status text;
  v_role   text;
  v_grant  boolean;
begin
  if v_uid is null then
    return false;
  end if;

  select status, role, (permissions->'surfaces'->>p_surface_id)::boolean
    into v_status, v_role, v_grant
    from public.organization_members
   where organization_id = p_org_id
     and user_id = v_uid;

  if v_status is null or v_status != 'active' then
    return false;
  end if;

  if v_role in ('owner', 'admin') then
    return true;
  end if;

  return coalesce(v_grant, false);
end;
$$;

grant execute on function public.has_member_surface(uuid, text) to authenticated;
revoke all on function public.has_member_surface(uuid, text) from public;

-- ── 4. Compliance mutation RPCs (replace direct trip_documents/trips writes) ─

create or replace function public.verify_trip_document(
  p_document_id uuid,
  p_status text,
  p_rejection_reason text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_trip_id uuid;
  v_org_id  uuid;
  v_old_status text;
begin
  if p_status not in ('verified', 'rejected') then
    raise exception 'invalid status: %', p_status;
  end if;
  if p_status = 'rejected' and coalesce(trim(p_rejection_reason), '') = '' then
    raise exception 'rejection_reason is required when rejecting a document';
  end if;

  select td.trip_id, t.organization_id, td.status
    into v_trip_id, v_org_id, v_old_status
    from public.trip_documents td
    join public.trips t on t.id = td.trip_id
   where td.id = p_document_id;

  if v_trip_id is null then
    raise exception 'document not found';
  end if;
  if not public.has_member_surface(v_org_id, 'trip_compliance.documents.verify') then
    raise exception 'not authorized to verify compliance documents for this organization';
  end if;

  update public.trip_documents
     set status = p_status,
         verified_by = v_uid,
         verified_at = now(),
         rejection_reason = case when p_status = 'rejected' then trim(p_rejection_reason) else null end
   where id = p_document_id;

  insert into public.document_audit_log
    (document_id, organization_id, entity_type, entity_id, action, actor_id, old_status, new_status, notes)
  values
    (null, v_org_id, 'trip_document', p_document_id, p_status, v_uid, v_old_status, p_status,
     case when p_status = 'rejected' then trim(p_rejection_reason) else null end);
end;
$$;

grant execute on function public.verify_trip_document(uuid, text, text) to authenticated;
revoke all on function public.verify_trip_document(uuid, text, text) from public;

create or replace function public.mark_trip_compliance_verified(p_trip_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_org_id  uuid;
  v_missing text;
  -- Kept in sync with REQUIRED_COMPLIANCE_DOCUMENT_TYPES in
  -- features/tripCompliance/tripCompliance.types.ts — server re-derives the
  -- gate rather than trusting the client's own check.
  v_required text[] := array['lr', 'invoice', 'eway_bill', 'insurance', 'rc'];
begin
  select organization_id into v_org_id from public.trips where id = p_trip_id;
  if v_org_id is null then
    raise exception 'trip not found';
  end if;
  if not public.has_member_surface(v_org_id, 'trip_compliance.trip.mark_verified') then
    raise exception 'not authorized to mark compliance verified for this organization';
  end if;

  select string_agg(rt, ', ') into v_missing
    from unnest(v_required) rt
   where not exists (
     select 1 from public.trip_documents td
      where td.trip_id = p_trip_id
        and td.document_type = rt
        and td.status = 'verified'
   );

  if v_missing is not null then
    raise exception 'required documents not yet verified: %', v_missing;
  end if;

  update public.trips
     set compliance_verified_by = v_uid,
         compliance_verified_at = now()
   where id = p_trip_id;
end;
$$;

grant execute on function public.mark_trip_compliance_verified(uuid) to authenticated;
revoke all on function public.mark_trip_compliance_verified(uuid) from public;

create or replace function public.record_trip_hard_copy_pod(
  p_trip_id uuid,
  p_courier text,
  p_awb_number text,
  p_received_by text
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if coalesce(trim(p_courier), '') = '' or coalesce(trim(p_awb_number), '') = '' or coalesce(trim(p_received_by), '') = '' then
    raise exception 'courier, AWB number, and received-by are all required';
  end if;

  select organization_id into v_org_id from public.trips where id = p_trip_id;
  if v_org_id is null then
    raise exception 'trip not found';
  end if;
  if not public.has_member_surface(v_org_id, 'trip_compliance.pod.manage') then
    raise exception 'not authorized to record hard-copy POD for this organization';
  end if;

  update public.trips
     set pod_hard_copy_courier = trim(p_courier),
         pod_hard_copy_awb_number = trim(p_awb_number),
         pod_hard_copy_received_by = trim(p_received_by)
   where id = p_trip_id;
end;
$$;

grant execute on function public.record_trip_hard_copy_pod(uuid, text, text, text) to authenticated;
revoke all on function public.record_trip_hard_copy_pod(uuid, text, text, text) from public;

-- ── 2. Trip-level compliance verification + hard-copy POD metadata (trips) ──

alter table public.trips
  add column if not exists compliance_verified_by uuid references auth.users(id),
  add column if not exists compliance_verified_at timestamptz,
  add column if not exists pod_hard_copy_courier text,
  add column if not exists pod_hard_copy_awb_number text,
  add column if not exists pod_hard_copy_received_by text;

comment on column public.trips.compliance_verified_at is
  'Set once required trip_documents rows are verified. Informational/parallel — never read by Core Trip status transitions.';
comment on column public.trips.pod_hard_copy_courier is
  'Hard-copy POD courier metadata. pod_received_at (existing column) remains the received-date field — not duplicated here.';
