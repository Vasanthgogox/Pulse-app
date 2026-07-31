-- Let the admin console (service_role) act as a driver-KYC reviewer.
--
-- All three review functions guard on
-- has_platform_permission(auth.uid(), 'driver_kyc.review'). The analytics
-- admin console connects with the service-role key and no user session
-- (see analytics/src/lib/supabase.ts — "uses service role to bypass RLS"),
-- so auth.uid() is null there and the guard can never pass. Service role
-- bypasses RLS *policies* but not an explicit RAISE inside a function body,
-- which is why the queue and document images load while every approve/reject
-- fails with "unauthorized: driver_kyc.review permission required".
--
-- Fix: swap the guard for can_review_driver_kyc(), which treats a trusted
-- server-side caller (service_role) as pre-authorized and still requires the
-- platform permission for everyone else — an ordinary authenticated user (e.g.
-- an org owner who finds the console URL) still cannot verify drivers.
--
-- Everything else in these functions is preserved byte-for-byte, including the
-- emit_platform_event() audit calls, which a naive rewrite would have dropped.
--
-- Accepted trade-off: console actions have no user identity, so verified_by /
-- reviewed_by / actor_id are null for them and the audit trail records what
-- happened but not who. Attributing reviewers needs a real staff login in the
-- console; until then, service_role actions are anonymous by construction.

-- ── Helper: single definition of "may review driver KYC" ─────────────────────
create or replace function public.can_review_driver_kyc()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Trusted server-side caller (admin console service-role key, backend
    -- job). Not reachable from an anon or authenticated browser client.
    current_user = 'service_role'
    or current_setting('role', true) = 'service_role'
    or public.has_platform_permission((select auth.uid()), 'driver_kyc.review');
$$;

revoke all on function public.can_review_driver_kyc() from public;
grant execute on function public.can_review_driver_kyc() to authenticated, service_role;

-- ── 1. Per-document approve — guard line only ───────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_approve_driver_kyc_document(p_document_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS driver_kyc_documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row public.driver_kyc_documents;
BEGIN
  IF NOT public.can_review_driver_kyc() THEN
    RAISE EXCEPTION 'unauthorized: driver_kyc.review permission required';
  END IF;

  UPDATE public.driver_kyc_documents
  SET
    status          = 'verified',
    verified_at     = now(),
    verified_by     = (select auth.uid()),
    rejection_notes = p_notes,
    updated_at      = now()
  WHERE id = p_document_id AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_kyc_document_not_found: %', p_document_id;
  END IF;

  -- Audit history: verified_by/verified_at on the row only ever hold the
  -- LATEST decision — a document rejected twice before being verified loses
  -- both prior rejection reasons if that's all we keep. platform_events is
  -- the existing, already-indexed (event_type, org_id) x created_at platform
  -- audit log (see platform_approve_verification for the established
  -- pattern) — append-only, so full history survives regardless of how many
  -- times a document is re-reviewed. This also doubles as the reporting/
  -- analytics substrate (approvals/rejections per day, per reviewer, etc.)
  -- without a new table.
  PERFORM public.emit_platform_event(
    'DriverKycDocumentApproved',
    NULL,
    jsonb_build_object(
      'document_id', v_row.id,
      'driver_user_id', v_row.driver_user_id,
      'doc_type', v_row.doc_type,
      'notes', p_notes
    )
  );

  RETURN v_row;
END;
$function$;

revoke all on function public.platform_approve_driver_kyc_document(uuid, text) from public;
grant execute on function public.platform_approve_driver_kyc_document(uuid, text) to authenticated, service_role;

-- ── 2. Per-document reject — guard line only ────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_reject_driver_kyc_document(p_document_id uuid, p_rejection_reason text)
 RETURNS driver_kyc_documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row public.driver_kyc_documents;
BEGIN
  IF NOT public.can_review_driver_kyc() THEN
    RAISE EXCEPTION 'unauthorized: driver_kyc.review permission required';
  END IF;

  IF coalesce(trim(p_rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE public.driver_kyc_documents
  SET
    status          = 'rejected',
    verified_at     = now(),
    verified_by     = (select auth.uid()),
    rejection_notes = p_rejection_reason,
    updated_at      = now()
  WHERE id = p_document_id AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_kyc_document_not_found: %', p_document_id;
  END IF;

  PERFORM public.emit_platform_event(
    'DriverKycDocumentRejected',
    NULL,
    jsonb_build_object(
      'document_id', v_row.id,
      'driver_user_id', v_row.driver_user_id,
      'doc_type', v_row.doc_type,
      'rejection_reason', p_rejection_reason
    )
  );

  RETURN v_row;
END;
$function$;

revoke all on function public.platform_reject_driver_kyc_document(uuid, text) from public;
grant execute on function public.platform_reject_driver_kyc_document(uuid, text) to authenticated, service_role;

-- ── 3. Driver-level decision — guard line only ──────────────────────────────
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
  if not public.can_review_driver_kyc() then
    raise exception 'unauthorized: driver_kyc.review permission required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid status: %', p_status;
  end if;

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
grant execute on function public.platform_review_driver_kyc_submission(uuid, text, text) to authenticated, service_role;
