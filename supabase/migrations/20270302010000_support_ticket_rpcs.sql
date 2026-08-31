-- Support System S1 — ticket creation/reply lifecycle, through reviewed RPCs only.
-- No raw client insert/update against support_tickets/support_ticket_comments is
-- possible -- the companion schema migration leaves those tables with SELECT-only RLS.

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

  -- Context-ID validation: every optional reference must be something the caller
  -- legitimately has access to, or ticket integrity breaks (Support would treat an
  -- unrelated trip/bid/org as genuine context). Each check reuses an existing access
  -- predicate already used elsewhere in this schema -- none of this is a new
  -- authorization concept:
  --   organization_id -> the same "active member" check accept_market_bid/
  --                       reject_market_bid use.
  --   owner_vehicle_id -> the exact ownership check submit_market_bid already uses.
  --   market_bid_id    -> the same bidder_user_id check market_bids' own RLS policy
  --                       (market_bids_select) uses.
  --   trip_id / indent_id -> OR-combinations of the same three relationships
  --                       (org membership, driver assignment, vehicle ownership,
  --                       market-bid ownership) already established above, not a
  --                       new relationship.
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

  -- Denormalized display fields only -- not authoritative, not access-checked. The
  -- FKs are the source of truth; a stale/wrong name here never grants or hides data,
  -- it only affects what the list view shows before a fresh join.
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
    reporter_display_name, organization_name
  ) values (
    v_display_id, v_uid, p_organization_id, trim(p_category), trim(p_subject),
    trim(p_description), p_source_screen, p_trip_id, p_indent_id, p_owner_vehicle_id,
    p_market_bid_id, v_reporter_name, v_org_name
  )
  returning id into v_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action)
  values (v_ticket_id, v_uid, 'created');

  return jsonb_build_object(
    'ticket_id', v_ticket_id, 'display_id', v_display_id, 'status', 'open'
  );
end;
$function$;

-- Support is a new security boundary -- unlike the pre-existing Market RPCs (which
-- carry the project's default anon+authenticated grant), this one is deliberately
-- narrowed: anonymous callers get no execute privilege at all, not just a runtime
-- auth.uid() check.
REVOKE EXECUTE ON FUNCTION public.submit_support_ticket(
  text, text, text, uuid, uuid, uuid, uuid, uuid, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.submit_support_ticket(
  text, text, text, uuid, uuid, uuid, uuid, uuid, text
) TO authenticated;

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

  update public.support_tickets set updated_at = now() where id = p_ticket_id;

  insert into public.support_ticket_activity (ticket_id, actor_user_id, action)
  values (p_ticket_id, v_uid, 'user_replied');

  return jsonb_build_object('comment_id', v_comment_id, 'ticket_id', p_ticket_id);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.reply_to_support_ticket(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.reply_to_support_ticket(uuid, text) TO authenticated;
