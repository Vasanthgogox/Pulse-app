-- Support unread / "update available" signals for Pulse users and Admin Console.
--
-- last_public_author_type + last_public_activity_at track the last customer-visible
-- message (or a status flip to waiting_for_user). Priority / internal notes bump
-- updated_at only and must NOT create false unread badges.
--
-- user_last_read_at / agent_last_read_at are set when each side opens the ticket
-- (or when they themselves write a public message).

alter table public.support_tickets
  add column if not exists last_public_author_type text not null default 'user',
  add column if not exists last_public_activity_at timestamptz not null default now(),
  add column if not exists user_last_read_at timestamptz,
  add column if not exists agent_last_read_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_last_public_author_type_check'
  ) then
    alter table public.support_tickets
      add constraint support_tickets_last_public_author_type_check
      check (last_public_author_type = any (array['user', 'agent']));
  end if;
end $$;

-- Backfill from latest public comment when present; otherwise leave as user/created_at.
update public.support_tickets t
set
  last_public_author_type = coalesce(c.author_type, 'user'),
  last_public_activity_at = coalesce(c.created_at, t.created_at),
  user_last_read_at = case
    when coalesce(c.author_type, 'user') = 'user' then coalesce(c.created_at, t.created_at)
    else t.user_last_read_at
  end
from (
  select distinct on (ticket_id)
    ticket_id,
    author_type,
    created_at
  from public.support_ticket_comments
  where visibility = 'public'
  order by ticket_id, created_at desc
) c
where c.ticket_id = t.id;

-- Tickets with no public comments yet: activity = created; reporter already "read" their own open.
update public.support_tickets t
set
  last_public_activity_at = t.created_at,
  user_last_read_at = coalesce(t.user_last_read_at, t.created_at)
where not exists (
  select 1
  from public.support_ticket_comments c
  where c.ticket_id = t.id
    and c.visibility = 'public'
);

-- User opens a ticket → clear their unread for that ticket.
create or replace function public.mark_support_ticket_read_by_user(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_ticket public.support_tickets;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  if v_ticket.created_by_user_id <> v_uid then
    raise exception 'unauthorized: caller does not own this ticket';
  end if;

  update public.support_tickets
  set user_last_read_at = now()
  where id = p_ticket_id;

  return jsonb_build_object('ticket_id', p_ticket_id, 'user_last_read_at', now());
end;
$function$;

revoke execute on function public.mark_support_ticket_read_by_user(uuid) from public, anon;
grant execute on function public.mark_support_ticket_read_by_user(uuid) to authenticated;

-- Admin Console opens a ticket → clear agent unread.
create or replace function public.admin_mark_support_ticket_read(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ticket public.support_tickets;
begin
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
  from public, anon, authenticated;
grant execute on function public.admin_mark_support_ticket_read(uuid) to service_role;

-- Patch submit: reporter has already "read" their own ticket; last public author = user.
create or replace function public.submit_support_ticket(
  p_category text,
  p_subject text,
  p_description text,
  p_organization_id uuid default null,
  p_trip_id uuid default null,
  p_indent_id uuid default null,
  p_owner_vehicle_id uuid default null,
  p_market_bid_id uuid default null,
  p_source_screen text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid            uuid := auth.uid();
  v_ticket_id      uuid;
  v_display_id     text;
  v_reporter_name  text;
  v_org_name       text;
  v_now            timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(coalesce(p_category, '')), '') is null then
    raise exception 'invalid_category';
  end if;
  if nullif(trim(coalesce(p_subject, '')), '') is null then
    raise exception 'invalid_subject';
  end if;
  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'invalid_description';
  end if;

  if p_organization_id is not null and not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = v_uid
      and om.status = 'active'
  ) then
    raise exception 'unauthorized_organization_reference';
  end if;

  if p_owner_vehicle_id is not null and not exists (
    select 1 from public.owner_vehicles ov
    where ov.id = p_owner_vehicle_id
      and ov.owner_user_id = v_uid
      and ov.deleted_at is null
  ) then
    raise exception 'unauthorized_vehicle_reference';
  end if;

  if p_market_bid_id is not null and not exists (
    select 1 from public.market_bids mb
    where mb.id = p_market_bid_id
      and mb.bidder_user_id = v_uid
  ) then
    raise exception 'unauthorized_market_bid_reference';
  end if;

  if p_trip_id is not null and not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (
        exists (
          select 1 from public.organization_members om
          where om.organization_id = t.organization_id
            and om.user_id = v_uid
            and om.status = 'active'
        )
        or exists (
          select 1 from public.drivers d
          where d.id = t.driver_id and d.user_id = v_uid
        )
        or exists (
          select 1 from public.owner_vehicles ov
          where ov.id = t.owner_vehicle_id and ov.owner_user_id = v_uid
        )
      )
  ) then
    raise exception 'unauthorized_trip_reference';
  end if;

  if p_indent_id is not null and not exists (
    select 1 from public.indents i
    where i.id = p_indent_id
      and (
        exists (
          select 1 from public.organization_members om
          where om.organization_id = i.organization_id
            and om.user_id = v_uid
            and om.status = 'active'
        )
        or exists (
          select 1 from public.market_bids mb
          where mb.indent_id = i.id and mb.bidder_user_id = v_uid
        )
      )
  ) then
    raise exception 'unauthorized_indent_reference';
  end if;

  select nullif(trim(coalesce(p.full_name, '')), '')
    into v_reporter_name
  from public.profiles p
  where p.id = v_uid;

  if p_organization_id is not null then
    select nullif(trim(coalesce(o.name, '')), '')
      into v_org_name
    from public.organizations o
    where o.id = p_organization_id;
  end if;

  v_display_id := public._next_support_ticket_display_id();

  insert into public.support_tickets (
    display_id, created_by_user_id, organization_id, category, subject, description,
    source_screen, trip_id, indent_id, owner_vehicle_id, market_bid_id,
    reporter_display_name, organization_name,
    last_public_author_type, last_public_activity_at, user_last_read_at
  ) values (
    v_display_id, v_uid, p_organization_id, trim(p_category), trim(p_subject),
    trim(p_description), p_source_screen, p_trip_id, p_indent_id, p_owner_vehicle_id,
    p_market_bid_id, v_reporter_name, v_org_name,
    'user', v_now, v_now
  )
  returning id into v_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action)
  values (v_ticket_id, v_uid, 'created');

  return jsonb_build_object(
    'ticket_id', v_ticket_id, 'display_id', v_display_id, 'status', 'open'
  );
end;
$function$;

revoke execute on function public.submit_support_ticket(
  text, text, text, uuid, uuid, uuid, uuid, uuid, text
) from public, anon;
grant execute on function public.submit_support_ticket(
  text, text, text, uuid, uuid, uuid, uuid, uuid, text
) to authenticated;

create or replace function public.reply_to_support_ticket(
  p_ticket_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid        uuid := auth.uid();
  v_ticket     public.support_tickets;
  v_comment_id uuid;
  v_now        timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'invalid_body';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'not_found: ticket %', p_ticket_id;
  end if;

  if v_ticket.created_by_user_id <> v_uid then
    raise exception 'unauthorized: caller does not own this ticket';
  end if;

  if v_ticket.status = 'closed' then
    raise exception 'invalid_state: ticket is closed';
  end if;

  insert into public.support_ticket_comments (ticket_id, author_user_id, body, visibility)
  values (p_ticket_id, v_uid, trim(p_body), 'public')
  returning id into v_comment_id;

  update public.support_tickets
  set
    updated_at = v_now,
    last_public_author_type = 'user',
    last_public_activity_at = v_now,
    user_last_read_at = v_now
  where id = p_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action)
  values (p_ticket_id, v_uid, 'user_replied');

  return jsonb_build_object('comment_id', v_comment_id, 'ticket_id', p_ticket_id);
end;
$function$;

revoke execute on function public.reply_to_support_ticket(uuid, text) from public, anon;
grant execute on function public.reply_to_support_ticket(uuid, text) to authenticated;

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

  update public.support_tickets
  set
    updated_at = v_now,
    last_public_author_type = 'agent',
    last_public_activity_at = v_now,
    agent_last_read_at = v_now
  where id = p_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action)
  values (p_ticket_id, null, 'agent_replied');

  return jsonb_build_object('comment_id', v_comment_id, 'ticket_id', p_ticket_id);
end;
$function$;

revoke execute on function public.admin_reply_to_support_ticket(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_reply_to_support_ticket(uuid, text) to service_role;

-- Status → waiting_for_user is an agent-side "please look" signal even without a new reply.
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
  values (p_ticket_id, null, 'status_changed', v_ticket.status || ' -> ' || p_status);

  return jsonb_build_object('ticket_id', p_ticket_id, 'status', p_status);
end;
$function$;

revoke execute on function public.admin_change_support_ticket_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_change_support_ticket_status(uuid, text) to service_role;
