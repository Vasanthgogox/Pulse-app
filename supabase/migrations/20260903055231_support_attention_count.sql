create or replace function public.admin_support_attention_count()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when not public.can_view_support() then null::integer
    else (
      select count(*)::integer
      from public.support_tickets t
      where t.status not in ('resolved', 'closed')
        and t.last_public_author_type = 'user'
        and t.last_public_activity_at is not null
        and (
          t.agent_last_read_at is null
          or t.last_public_activity_at > t.agent_last_read_at
        )
    )
  end;
$$;

revoke all on function public.admin_support_attention_count() from public, anon;
grant execute on function public.admin_support_attention_count()
  to authenticated, service_role;