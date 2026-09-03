create index if not exists idx_support_tickets_updated_at
  on public.support_tickets (updated_at desc);

create index if not exists idx_support_tickets_needs_attention
  on public.support_tickets (last_public_activity_at desc)
  where last_public_author_type = 'user'
    and status not in ('resolved', 'closed');

create extension if not exists pg_trgm;

create index if not exists idx_support_tickets_search_trgm
  on public.support_tickets using gin (
    (
      coalesce(display_id, '') || ' ' ||
      coalesce(subject, '') || ' ' ||
      coalesce(reporter_display_name, '') || ' ' ||
      coalesce(organization_name, '')
    ) gin_trgm_ops
  );

create or replace function public.admin_list_support_tickets(
  p_search text default null,
  p_status text default null,
  p_unassigned_only boolean default false,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_search   text := nullif(trim(coalesce(p_search, '')), '');
  v_status   text := nullif(trim(coalesce(p_status, '')), '');
  v_limit    int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset   int  := greatest(coalesce(p_offset, 0), 0);
  v_rows     jsonb;
  v_total    bigint;
  v_counts   jsonb;
  v_attention bigint;
begin
  if not public.can_view_support() then
    raise exception 'unauthorized: support.view permission required';
  end if;

  if v_status is not null and v_status <> all (
    array['open','assigned','in_progress','waiting_for_user','resolved','closed']
  ) then
    raise exception 'invalid_status: %', v_status;
  end if;

  with filtered as (
    select t.*
    from public.support_tickets t
    where (v_status is null or t.status = v_status)
      and (not coalesce(p_unassigned_only, false) or t.assigned_to is null)
      and (
        v_search is null
        or (
          coalesce(t.display_id, '') || ' ' ||
          coalesce(t.subject, '') || ' ' ||
          coalesce(t.reporter_display_name, '') || ' ' ||
          coalesce(t.organization_name, '')
        ) ilike '%' || v_search || '%'
      )
  )
  select
    coalesce(
      (
        select jsonb_agg(to_jsonb(p) order by p.updated_at desc)
        from (
          select * from filtered
          order by updated_at desc
          limit v_limit offset v_offset
        ) p
      ),
      '[]'::jsonb
    ),
    (select count(*) from filtered)
  into v_rows, v_total;

  select
    coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
  into v_counts
  from (
    select t.status, count(*) as n
    from public.support_tickets t
    where (not coalesce(p_unassigned_only, false) or t.assigned_to is null)
      and (
        v_search is null
        or (
          coalesce(t.display_id, '') || ' ' ||
          coalesce(t.subject, '') || ' ' ||
          coalesce(t.reporter_display_name, '') || ' ' ||
          coalesce(t.organization_name, '')
        ) ilike '%' || v_search || '%'
      )
    group by t.status
  ) s;

  select count(*)
  into v_attention
  from public.support_tickets t
  where t.status not in ('resolved', 'closed')
    and t.last_public_author_type = 'user'
    and t.last_public_activity_at is not null
    and (t.agent_last_read_at is null or t.last_public_activity_at > t.agent_last_read_at);

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'status_counts', v_counts,
    'needs_attention', v_attention,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$;

revoke all on function public.admin_list_support_tickets(text, text, boolean, int, int)
  from public, anon;
grant execute on function public.admin_list_support_tickets(text, text, boolean, int, int)
  to authenticated, service_role;