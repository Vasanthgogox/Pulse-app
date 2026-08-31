-- Support ticket attachments — pulling the S4 upload capability forward into the core Create
-- Ticket flow, per product decision: evidence (screenshots, invoices, PODs) belongs to the
-- message that introduced it, so it's attached at ticket-creation time via the already-nullable
-- support_ticket_attachments.comment_id (NULL = attached to the ticket's opening message, not a
-- reply) rather than inventing a second attachment path.
--
-- Does not touch submit_support_ticket()/reply_to_support_ticket() signatures — attachments are
-- recorded via a new, separate RPC after the ticket/comment already exists, so a failed upload
-- can never produce a broken/partial ticket.

-- ── 1. Fix a real RLS gap found during inspection ───────────────────────────────────────────
-- The S1 policy checked ticket ownership only, never comment visibility. As written, a ticket
-- owner could SELECT an attachment row tied to an internal-only comment (comment_id -> a comment
-- with visibility='internal') merely because they own the ticket -- the exact thing this feature
-- explicitly must not allow. Mirrors support_ticket_comments_select's own visibility filter.

drop policy if exists support_ticket_attachments_select on public.support_ticket_attachments;
create policy support_ticket_attachments_select on public.support_ticket_attachments
  for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_attachments.ticket_id
        and t.created_by_user_id = (select auth.uid())
    )
    and (
      support_ticket_attachments.comment_id is null
      or exists (
        select 1 from public.support_ticket_comments c
        where c.id = support_ticket_attachments.comment_id
          and c.visibility = 'public'
      )
    )
  );

-- ── 2. record_support_ticket_attachment — the only way to write this table ─────────────────
-- No INSERT/UPDATE/DELETE policy exists for `authenticated` on support_ticket_attachments (by
-- design, matching support_tickets/support_ticket_comments) -- this SECURITY DEFINER RPC is the
-- sole write path, same shape as submit_support_ticket/reply_to_support_ticket.
--
-- Called only after a real Storage upload already succeeded (Storage RLS + the bucket's own
-- file_size_limit/allowed_mime_types already gate what bytes could exist at p_storage_path --
-- this function does not re-validate file content, only that the path/ticket/comment genuinely
-- belong to the caller).

create or replace function public.record_support_ticket_attachment(
  p_ticket_id uuid,
  p_storage_path text,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_comment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_attachment_id uuid;
  v_expected_prefix text;
  v_existing_count int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(coalesce(p_storage_path, '')), '') is null then
    raise exception 'invalid_storage_path';
  end if;

  if not exists (
    select 1 from public.support_tickets t
    where t.id = p_ticket_id and t.created_by_user_id = v_uid
  ) then
    raise exception 'unauthorized_ticket_reference';
  end if;

  -- Not exercised by the UI yet (only ticket-opening attachments ship in this pass), but keeps
  -- the RPC correct if/when reply attachments are added later without another migration.
  if p_comment_id is not null and not exists (
    select 1 from public.support_ticket_comments c
    where c.id = p_comment_id
      and c.ticket_id = p_ticket_id
      and c.author_user_id = v_uid
  ) then
    raise exception 'unauthorized_comment_reference';
  end if;

  -- Path must genuinely be this user's own folder for this ticket -- defense in depth on top of
  -- Storage RLS, so a caller can never register a row pointing at someone else's object even if
  -- they somehow learned its path.
  v_expected_prefix := v_uid::text || '/' || p_ticket_id::text || '/';
  if left(p_storage_path, length(v_expected_prefix)) <> v_expected_prefix then
    raise exception 'invalid_storage_path';
  end if;

  select count(*) into v_existing_count
  from public.support_ticket_attachments
  where ticket_id = p_ticket_id;

  -- Authoritative cap -- mirrors SUPPORT_ATTACHMENT_MAX_PER_TICKET in
  -- features/support/services/supportTickets.service.ts (client-side UX guardrail only,
  -- not enforced there). Keep both in sync if this changes.
  if v_existing_count >= 10 then
    raise exception 'too_many_attachments';
  end if;

  insert into public.support_ticket_attachments (
    ticket_id, comment_id, storage_path, mime_type, size_bytes, uploaded_by_user_id
  ) values (
    p_ticket_id, p_comment_id, p_storage_path, p_mime_type, p_size_bytes, v_uid
  )
  returning id into v_attachment_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action, detail)
  values (p_ticket_id, v_uid, 'attachment_added', p_storage_path);

  return v_attachment_id;
end;
$function$;

-- Support is a new security boundary (see 20270302020000) -- deliberately no PUBLIC/anon grant.
REVOKE EXECUTE ON FUNCTION public.record_support_ticket_attachment(
  uuid, text, text, bigint, uuid
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_support_ticket_attachment(
  uuid, text, text, bigint, uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_support_ticket_attachment(
  uuid, text, text, bigint, uuid
) TO authenticated;

-- ── 3. Storage bucket + policies ─────────────────────────────────────────────────────────────
-- Private bucket. Path: {uploaded_by_user_id}/{ticket_id}/{uuid}-{filename} -- folder-scoped RLS
-- (mirrors owner-vehicle-documents' convention) means a user can never read another user's
-- attachment even by guessing a ticket/attachment id, since Storage checks the real auth.uid(),
-- not the path string alone.
--
-- Authoritative limits -- mirror SUPPORT_ATTACHMENT_MAX_BYTES / SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES
-- in features/support/services/supportTickets.service.ts (client-side UX guardrails only, checked
-- before upload so failures surface fast; this bucket config is what's actually enforced). Keep
-- both in sync if either changes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-ticket-attachments',
  'support-ticket-attachments',
  false,
  15728640, -- 15 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Support ticket owners upload own attachments" on storage.objects;
create policy "Support ticket owners upload own attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'support-ticket-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Support ticket owners read own attachments" on storage.objects;
create policy "Support ticket owners read own attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'support-ticket-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- No UPDATE/DELETE policy: attachments are removed from the client's staged list only before
-- upload (nothing to delete server-side yet); post-submit removal/replacement is not in this
-- pass's scope. service_role (Admin Console) bypasses RLS entirely, same as every other bucket.
