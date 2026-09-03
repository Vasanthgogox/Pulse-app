-- Support Phase 1 — move the Admin Support Console off the service-role key and
-- onto the signed-in admin's own session.
--
-- Context. The console now has a real login (analytics/src/context/AdminAuthProvider.tsx,
-- anon-key client + get_my_platform_permissions()), which did not exist when the
-- admin_* Support RPCs were written. Those RPCs are currently granted to
-- service_role ONLY, so the console can only call them by shipping the
-- service_role secret into a browser bundle. Two consequences this migration ends:
--
--   1. Anyone who opens devtools on the console has a key that bypasses all RLS
--      on every table in the project, not just Support.
--   2. auth.uid() is null on every console action, so `actor_user_id` on each
--      support_ticket_activity row is null — the trail records what happened but
--      never who did it. 20270121000000 (driver KYC) called this out explicitly
--      as an accepted trade-off "until there's a real staff login". There is one now.
--
-- Shape of the fix mirrors the established can_review_driver_kyc() precedent from
-- that same migration: one helper that names the authorization rule, a guard at the
-- top of each function, and grants widened to `authenticated`. service_role stays
-- permitted throughout so nothing that calls these server-side breaks while the
-- client migrates.
--
-- Function bodies are otherwise preserved as-is, except that actor_user_id /
-- author_user_id now record auth.uid() instead of a hardcoded null. That is the
-- whole point of the change, and it is null-safe: a service_role caller has no
-- auth.uid() and still writes null exactly as before.

-- ── 1. Permission keys ───────────────────────────────────────────────────────
-- Without these seeded, has_platform_permission(..., 'support.*') is false for
-- everyone and the guards below would lock every admin out of the console.
-- 'support.view' gates reading the queue; 'support.manage' gates acting on a
-- ticket (reply, note, status, priority).
INSERT INTO public.platform_permissions (key, description) VALUES
  ('support.view',   'View the support ticket queue and ticket conversations'),
  ('support.manage', 'Reply to, annotate, and change status/priority of support tickets')
ON CONFLICT (key) DO NOTHING;

-- super_admin is granted every permission by an unrestricted cross join in
-- 20261224000000_platform_iam.sql, but that ran before these keys existed — so it
-- has to be re-applied for the two rows just inserted.
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'super_admin'
  AND p.key IN ('support.view', 'support.manage')
ON CONFLICT DO NOTHING;

-- control_tower is the existing day-to-day operations role (verification review +
-- credit adjustments). Support triage is that same job, so it gets both keys.
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'control_tower'
  AND p.key IN ('support.view', 'support.manage')
ON CONFLICT DO NOTHING;

-- ── 2. Authorization helpers ─────────────────────────────────────────────────
-- Deliberately identical in shape to can_review_driver_kyc(): a trusted
-- server-side caller passes, everyone else needs the platform permission. Not
-- reachable from an anon or authenticated browser client without that permission.

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

-- ── 3. Admin write RPCs — guard + real actor attribution ─────────────────────

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

  -- author_type stays 'agent' regardless of actor: it drives the user-facing
  -- "who spoke last" rendering, which must not change just because the reply now
  -- carries an identity. author_user_id is the new part.
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

  -- Internal notes deliberately do NOT bump support_tickets.updated_at -- the
  -- user never sees this content, so it should not make their "My Tickets" list
  -- look like something changed for them when nothing did. (Preserved from
  -- 20270302040000; the visibility='internal' row stays unreadable to the
  -- reporter via support_ticket_comments_select.)
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

-- Status → waiting_for_user is an agent-side "please look" signal even without a
-- new reply, so it moves the last_public_* cursors. Carried forward verbatim from
-- 20270303030000 (the read-cursor version supersedes 20270302040000's).
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

-- Read cursor. Guarded on view, not manage: opening a ticket to read it is not a
-- mutation of ticket content, and a view-only admin clearing their own unread
-- marker is the expected behaviour.
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

-- ── 4. Admin read access (RLS) ───────────────────────────────────────────────
-- The console reads these four tables directly. Under service_role that worked
-- because RLS was bypassed entirely; on a session client it needs real policies,
-- or every query silently returns zero rows.
--
-- Each is additive and permissive: PostgreSQL ORs multiple permissive policies
-- together, so the existing reporter-facing policies keep working untouched and
-- these only widen access for platform admins. Note that support_ticket_activity
-- had NO select policy at all (default-deny by design, per 20270302000000) —
-- this gives it exactly one, admin-only, which preserves that boundary for
-- ordinary users.

create policy support_tickets_admin_select on public.support_tickets
  for select
  to authenticated
  using (public.can_view_support());

-- Unlike support_ticket_comments_select (reporter, public-only), this one has no
-- visibility filter: internal notes are precisely what the console needs to show.
create policy support_ticket_comments_admin_select on public.support_ticket_comments
  for select
  to authenticated
  using (public.can_view_support());

create policy support_ticket_activity_admin_select on public.support_ticket_activity
  for select
  to authenticated
  using (public.can_view_support());

create policy support_ticket_attachments_admin_select on public.support_ticket_attachments
  for select
  to authenticated
  using (public.can_view_support());

-- ── 5. Attachment bytes (Storage RLS) ────────────────────────────────────────
-- The bucket's only SELECT policy is folder-scoped to the uploader
-- ((storage.foldername(name))[1] = auth.uid()), which 20270303010000 notes was
-- fine because "service_role (Admin Console) bypasses RLS entirely". Once the
-- console holds a user session that stops being true and every signed-URL
-- request 404s. This is the storage-side twin of the table policies above:
-- read-only, admin-only, same bucket.
drop policy if exists "Support admins read ticket attachments" on storage.objects;
create policy "Support admins read ticket attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'support-ticket-attachments'
  and public.can_view_support()
);

-- ── 6. Ticket context labels ─────────────────────────────────────────────────
-- The console renders "related record" chips (trip route, indent number, vehicle
-- number, bid amount) by reading trips/indents/owner_vehicles/market_bids
-- directly. Those four are ordinary business tables whose RLS is scoped to org
-- membership or ownership — a platform admin matches none of it, so on a session
-- client every lookup would come back null and the chips would silently degrade
-- to raw UUIDs. No error, just worse UI, which is the hardest kind of regression
-- to notice.
--
-- Granting admins blanket SELECT on all four would be a far wider privilege than
-- Support needs (every trip and every bid on the platform, for a label). Instead
-- this reads them inside one security-definer function that returns ONLY the four
-- display strings, gated on the same support.view check as everything else. The
-- admin gets the label, not the table.
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

  -- Each lookup mirrors what resolveSupportTicketContextLabels() did client-side,
  -- including the "never invent a label" contract: an unresolvable record yields
  -- null and the caller falls back to showing the raw ID.
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
