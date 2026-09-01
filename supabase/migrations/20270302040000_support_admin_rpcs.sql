-- S2 — Admin Support Console operational RPCs.
--
-- Access model (explicitly interim, per docs/SUPPORT_SYSTEM_PLAN.md §15 Decision A):
-- the Admin Console (analytics/) runs entirely under the service_role key today, with
-- no per-admin session -- matching every existing panel (admin_approve_profile,
-- admin_reject_profile, etc). These four RPCs follow that same shape.
--
-- One deliberate tightening vs. that existing precedent: admin_approve_profile and
-- admin_reject_profile are (today, already, pre-existing) callable by PUBLIC/anon/
-- authenticated as well as service_role. That's not something this migration touches
-- or preserves by copying -- Support is a new security boundary, and there's no
-- reason to let a random authenticated Pulse user call these on someone else's
-- ticket just because an older RPC does. Grants below are service_role only.
--
-- No agent identity exists yet (S3), so none of these RPCs take or check a caller
-- identity -- actor_user_id/author_user_id are NULL for every action here, which is
-- the honest state of the world today, not a placeholder.

create or replace function public.admin_reply_to_support_ticket(
  p_ticket_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ticket     public.support_tickets;
  v_comment_id uuid;
begin
  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'invalid_body';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  insert into public.support_ticket_comments (
    ticket_id, author_user_id, author_type, body, visibility
  ) values (
    p_ticket_id, null, 'agent', trim(p_body), 'public'
  )
  returning id into v_comment_id;

  update public.support_tickets set updated_at = now() where id = p_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action)
  values (p_ticket_id, null, 'agent_replied');

  return jsonb_build_object('comment_id', v_comment_id, 'ticket_id', p_ticket_id);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_reply_to_support_ticket(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reply_to_support_ticket(uuid, text) TO service_role;

create or replace function public.admin_add_internal_note(
  p_ticket_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_comment_id uuid;
begin
  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'invalid_body';
  end if;

  if not exists (select 1 from public.support_tickets where id = p_ticket_id) then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  -- Internal notes deliberately do NOT bump support_tickets.updated_at -- the
  -- user never sees this content, so it should not make their "My Tickets" list
  -- look like something changed for them when nothing did.
  insert into public.support_ticket_comments (
    ticket_id, author_user_id, author_type, body, visibility
  ) values (
    p_ticket_id, null, 'agent', trim(p_body), 'internal'
  )
  returning id into v_comment_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action)
  values (p_ticket_id, null, 'internal_note_added');

  return jsonb_build_object('comment_id', v_comment_id, 'ticket_id', p_ticket_id);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_add_internal_note(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_internal_note(uuid, text) TO service_role;

create or replace function public.admin_change_support_ticket_status(
  p_ticket_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ticket public.support_tickets;
begin
  if p_status <> all (
    array['open','assigned','in_progress','waiting_for_user','resolved','closed']
  ) then
    raise exception 'invalid_status: %', p_status;
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  -- resolved_at/closed_at reflect the ticket's CURRENT terminal state, not a
  -- permanent history (support_ticket_activity already keeps the full history of
  -- every transition, with a timestamp, regardless of these two columns).
  -- Moving to resolved sets resolved_at, closed_at untouched (so a
  -- resolved-then-closed ticket keeps both). Moving to closed sets closed_at the
  -- same way. Reopening -- moving to anything else -- clears both: the ticket is
  -- active again, not "still resolved" or "still closed".
  update public.support_tickets
  set
    status = p_status,
    resolved_at = case
      when p_status = 'resolved' then now()
      when p_status = 'closed' then resolved_at
      else null
    end,
    closed_at = case
      when p_status = 'closed' then now()
      else null
    end,
    updated_at = now()
  where id = p_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action, detail)
  values (p_ticket_id, null, 'status_changed', v_ticket.status || ' -> ' || p_status);

  return jsonb_build_object('ticket_id', p_ticket_id, 'status', p_status);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_change_support_ticket_status(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_support_ticket_status(uuid, text) TO service_role;

create or replace function public.admin_change_support_ticket_priority(
  p_ticket_id uuid,
  p_priority text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_priority <> all (array['low','medium','high','critical']) then
    raise exception 'invalid_priority: %', p_priority;
  end if;

  if not exists (select 1 from public.support_tickets where id = p_ticket_id) then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  update public.support_tickets
  set priority = p_priority, updated_at = now()
  where id = p_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action, detail)
  values (p_ticket_id, null, 'priority_changed', p_priority);

  return jsonb_build_object('ticket_id', p_ticket_id, 'priority', p_priority);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_change_support_ticket_priority(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_support_ticket_priority(uuid, text) TO service_role;
