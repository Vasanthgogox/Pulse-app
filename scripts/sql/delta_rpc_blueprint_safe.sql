-- ==============================================================================
-- DELTA RPC BLUEPRINT (SAFE / IDEMPOTENT)
-- Target repo for apply: Q-unified-base (shared Supabase schema)
-- ==============================================================================
--
-- Purpose:
-- - Add additive, cursor-based delta RPCs for mobile/web clients.
-- - Keep existing full-fetch RPCs and table APIs untouched.
-- - Return only changed/deleted rows after a cursor.
--
-- Usage:
--   supabase db query --linked -f scripts/sql/delta_rpc_blueprint_safe.sql -o table
--
-- Notes:
-- - This script is safe to run repeatedly.
-- - Deletions are best-effort unless a tombstone table is enabled.

create table if not exists public.cache_tombstones (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  organization_id uuid not null,
  deleted_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_cache_tombstones_lookup
  on public.cache_tombstones (table_name, organization_id, deleted_at desc);

create or replace function public.get_trips_delta(
  p_org_id uuid,
  p_since timestamptz,
  p_limit int default 500
)
returns table (
  changed jsonb,
  deleted_ids uuid[],
  next_cursor timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next timestamptz;
begin
  with changed_rows as (
    select t.*
    from public.trips t
    where t.organization_id = p_org_id
      and t.updated_at > coalesce(p_since, '1970-01-01'::timestamptz)
    order by t.updated_at asc, t.id asc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  )
  select max(updated_at) into v_next from changed_rows;

  return query
  select
    coalesce((select jsonb_agg(to_jsonb(c.*)) from changed_rows c), '[]'::jsonb),
    coalesce((
      select array_agg(ct.row_id)
      from public.cache_tombstones ct
      where ct.table_name = 'trips'
        and ct.organization_id = p_org_id
        and ct.deleted_at > coalesce(p_since, '1970-01-01'::timestamptz)
    ), '{}'::uuid[]),
    coalesce(v_next, p_since);
end;
$$;

grant execute on function public.get_trips_delta(uuid, timestamptz, int) to authenticated;

create or replace function public.get_transactions_delta(
  p_org_id uuid,
  p_since timestamptz,
  p_limit int default 500
)
returns table (
  changed jsonb,
  deleted_ids uuid[],
  next_cursor timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next timestamptz;
begin
  with changed_rows as (
    select tx.*
    from public.transactions tx
    where tx.organization_id = p_org_id
      and tx.updated_at > coalesce(p_since, '1970-01-01'::timestamptz)
    order by tx.updated_at asc, tx.id asc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  )
  select max(updated_at) into v_next from changed_rows;

  return query
  select
    coalesce((select jsonb_agg(to_jsonb(c.*)) from changed_rows c), '[]'::jsonb),
    coalesce((
      select array_agg(ct.row_id)
      from public.cache_tombstones ct
      where ct.table_name = 'transactions'
        and ct.organization_id = p_org_id
        and ct.deleted_at > coalesce(p_since, '1970-01-01'::timestamptz)
    ), '{}'::uuid[]),
    coalesce(v_next, p_since);
end;
$$;

grant execute on function public.get_transactions_delta(uuid, timestamptz, int) to authenticated;

create or replace function public.get_clients_delta(
  p_org_id uuid,
  p_since timestamptz,
  p_limit int default 500
)
returns table (
  changed jsonb,
  deleted_ids uuid[],
  next_cursor timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next timestamptz;
begin
  with changed_rows as (
    select c.*
    from public.clients c
    where c.organization_id = p_org_id
      and c.updated_at > coalesce(p_since, '1970-01-01'::timestamptz)
    order by c.updated_at asc, c.id asc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  )
  select max(updated_at) into v_next from changed_rows;

  return query
  select
    coalesce((select jsonb_agg(to_jsonb(c.*)) from changed_rows c), '[]'::jsonb),
    coalesce((
      select array_agg(ct.row_id)
      from public.cache_tombstones ct
      where ct.table_name = 'clients'
        and ct.organization_id = p_org_id
        and ct.deleted_at > coalesce(p_since, '1970-01-01'::timestamptz)
    ), '{}'::uuid[]),
    coalesce(v_next, p_since);
end;
$$;

grant execute on function public.get_clients_delta(uuid, timestamptz, int) to authenticated;

create index if not exists idx_trips_org_updated_at on public.trips (organization_id, updated_at desc, id);
create index if not exists idx_transactions_org_updated_at on public.transactions (organization_id, updated_at desc, id);
create index if not exists idx_clients_org_updated_at on public.clients (organization_id, updated_at desc, id);
