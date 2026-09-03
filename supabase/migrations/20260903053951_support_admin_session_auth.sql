-- Support Phase 1 — move the Admin Support Console off the service-role key and
-- onto the signed-in admin's own session. Full commentary in
-- supabase/migrations/20270304000000_support_admin_session_auth.sql

INSERT INTO public.platform_permissions (key, description) VALUES
  ('support.view',   'View the support ticket queue and ticket conversations'),
  ('support.manage', 'Reply to, annotate, and change status/priority of support tickets')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'super_admin'
  AND p.key IN ('support.view', 'support.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'control_tower'
  AND p.key IN ('support.view', 'support.manage')
ON CONFLICT DO NOTHING;

create or replace function public.can_view_support()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    current_user = 'service_role'
    or current_setting('role', true) = 'service_role'
    or public.has_platform_permission((select auth.uid()), 'support.view')
    or public.has_platform_permission((select auth.uid()), 'support.manage');
$$;

revoke all on function public.can_view_support() from public;
grant execute on function public.can_view_support() to authenticated, service_role;

create or replace function public.can_manage_support()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    current_user = 'service_role'
    or current_setting('role', true) = 'service_role'
    or public.has_platform_permission((select auth.uid()), 'support.manage');
$$;

revoke all on function public.can_manage_support() from public;
grant execute on function public.can_manage_support() to authenticated, service_role;

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
  v_now        timestamptz := now();
  v_actor      uuid := (select auth.uid());
begin
  if not public.can_manage_support() then
    raise exception 'unauthorized: support.manage permission required';
  end if;

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
    p_ticket_id, v_actor, 'agent', trim(p_body), 'public'
  )
  returning id into v_comment_id;

  update public.support_tickets
  set
    updated_at = v_now,
    last_public_author_type = 'agent',
    last_public_activity_at = v_now,
    agent_last_read_at = v_now
  where id = p_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action)
  values (p_ticket_id, v_actor, 'agent_replied');

  return jsonb_build_object('comment_id', v_comment_id, 'ticket_id', p_ticket_id);
end;
$function$;

revoke execute on function public.admin_reply_to_support_ticket(uuid, text)
  from public, anon;
grant execute on function public.admin_reply_to_support_ticket(uuid, text)
  to authenticated, service_role;

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
  v_actor      uuid := (select auth.uid());
begin
  if not public.can_manage_support() then
    raise exception 'unauthorized: support.manage permission required';
  end if;

  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'invalid_body';
  end if;

  if not exists (select 1 from public.support_tickets where id = p_ticket_id) then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  insert into public.support_ticket_comments (
    ticket_id, author_user_id, author_type, body, visibility
  ) values (
    p_ticket_id, v_actor, 'agent', trim(p_body), 'internal'
  )
  returning id into v_comment_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action)
  values (p_ticket_id, v_actor, 'internal_note_added');

  return jsonb_build_object('comment_id', v_comment_id, 'ticket_id', p_ticket_id);
end;
$function$;

revoke execute on function public.admin_add_internal_note(uuid, text)
  from public, anon;
grant execute on function public.admin_add_internal_note(uuid, text)
  to authenticated, service_role;

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
  v_now    timestamptz := now();
  v_actor  uuid := (select auth.uid());
begin
  if not public.can_manage_support() then
    raise exception 'unauthorized: support.manage permission required';
  end if;

  if p_status <> all (
    array['open','assigned','in_progress','waiting_for_user','resolved','closed']
  ) then
    raise exception 'invalid_status: %', p_status;
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  update public.support_tickets
  set
    status = p_status,
    resolved_at = case
      when p_status = 'resolved' then v_now
      when p_status = 'closed' then resolved_at
      else null
    end,
    closed_at = case
      when p_status = 'closed' then v_now
      else null
    end,
    updated_at = v_now,
    last_public_author_type = case
      when p_status = 'waiting_for_user' then 'agent'
      else last_public_author_type
    end,
    last_public_activity_at = case
      when p_status = 'waiting_for_user' then v_now
      else last_public_activity_at
    end,
    agent_last_read_at = case
      when p_status = 'waiting_for_user' then v_now
      else agent_last_read_at
    end
  where id = p_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action, detail)
  values (p_ticket_id, v_actor, 'status_changed', v_ticket.status || ' -> ' || p_status);

  return jsonb_build_object('ticket_id', p_ticket_id, 'status', p_status);
end;
$function$;

revoke execute on function public.admin_change_support_ticket_status(uuid, text)
  from public, anon;
grant execute on function public.admin_change_support_ticket_status(uuid, text)
  to authenticated, service_role;

create or replace function public.admin_change_support_ticket_priority(
  p_ticket_id uuid,
  p_priority text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.can_manage_support() then
    raise exception 'unauthorized: support.manage permission required';
  end if;

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
  values (p_ticket_id, v_actor, 'priority_changed', p_priority);

  return jsonb_build_object('ticket_id', p_ticket_id, 'priority', p_priority);
end;
$function$;

revoke execute on function public.admin_change_support_ticket_priority(uuid, text)
  from public, anon;
grant execute on function public.admin_change_support_ticket_priority(uuid, text)
  to authenticated, service_role;

create or replace function public.admin_mark_support_ticket_read(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ticket public.support_tickets;
begin
  if not public.can_view_support() then
    raise exception 'unauthorized: support.view permission required';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  update public.support_tickets
  set agent_last_read_at = now()
  where id = p_ticket_id;

  return jsonb_build_object('ticket_id', p_ticket_id, 'agent_last_read_at', now());
end;
$function$;

revoke execute on function public.admin_mark_support_ticket_read(uuid)
  from public, anon;
grant execute on function public.admin_mark_support_ticket_read(uuid)
  to authenticated, service_role;

drop policy if exists support_tickets_admin_select on public.support_tickets;
create policy support_tickets_admin_select on public.support_tickets
  for select
  to authenticated
  using (public.can_view_support());

drop policy if exists support_ticket_comments_admin_select on public.support_ticket_comments;
create policy support_ticket_comments_admin_select on public.support_ticket_comments
  for select
  to authenticated
  using (public.can_view_support());

drop policy if exists support_ticket_activity_admin_select on public.support_ticket_activity;
create policy support_ticket_activity_admin_select on public.support_ticket_activity
  for select
  to authenticated
  using (public.can_view_support());

drop policy if exists support_ticket_attachments_admin_select on public.support_ticket_attachments;
create policy support_ticket_attachments_admin_select on public.support_ticket_attachments
  for select
  to authenticated
  using (public.can_view_support());

drop policy if exists "Support admins read ticket attachments" on storage.objects;
create policy "Support admins read ticket attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'support-ticket-attachments'
  and public.can_view_support()
);

create or replace function public.admin_support_ticket_context_labels(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_ticket public.support_tickets;
  v_trip   text;
  v_indent text;
  v_veh    text;
  v_bid    text;
begin
  if not public.can_view_support() then
    raise exception 'unauthorized: support.view permission required';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  if v_ticket.trip_id is not null then
    select
      case
        when t.pickup_area is null and t.drop_location is null then null
        else coalesce(nullif(trim(t.pickup_area), ''), 'Pickup')
             || ' → '
             || coalesce(nullif(trim(t.drop_location), ''), 'Drop')
      end
    into v_trip
    from public.trips t
    where t.id = v_ticket.trip_id;
  end if;

  if v_ticket.indent_id is not null then
    select coalesce(i.display_indent_id, i.indent_number)
    into v_indent
    from public.indents i
    where i.id = v_ticket.indent_id;
  end if;

  if v_ticket.owner_vehicle_id is not null then
    select ov.vehicle_number
    into v_veh
    from public.owner_vehicles ov
    where ov.id = v_ticket.owner_vehicle_id;
  end if;

  if v_ticket.market_bid_id is not null then
    select '₹' || trim(to_char(mb.amount, 'FM99,99,99,999'))
    into v_bid
    from public.market_bids mb
    where mb.id = v_ticket.market_bid_id
      and mb.amount is not null;
  end if;

  return jsonb_build_object(
    'trip', v_trip,
    'indent', v_indent,
    'vehicle', v_veh,
    'marketBid', v_bid
  );
end;
$function$;

revoke all on function public.admin_support_ticket_context_labels(uuid) from public, anon;
grant execute on function public.admin_support_ticket_context_labels(uuid)
  to authenticated, service_role;