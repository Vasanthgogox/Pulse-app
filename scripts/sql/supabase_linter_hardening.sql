-- Supabase linter hardening (bulk remediation)
--
-- Run from Supabase SQL Editor, or with:
--   supabase db query --linked -f scripts/sql/supabase_linter_hardening.sql -o table
--
-- This script remediates:
-- - function_search_path_mutable
-- - extension_in_public
-- - materialized_view_in_api
-- - public_bucket_allows_listing
-- - anon/authenticated SECURITY DEFINER executable warnings

-- 1) Ensure common extension schema exists.
create schema if not exists extensions;

-- 2) Move extensions out of public schema if present.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      execute 'alter extension pg_net set schema extensions';
    exception
      when feature_not_supported then
        raise notice 'Skipping pg_net schema move: extension does not support SET SCHEMA';
    end;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    begin
      execute 'alter extension pg_trgm set schema extensions';
    exception
      when feature_not_supported then
        raise notice 'Skipping pg_trgm schema move: extension does not support SET SCHEMA';
    end;
  end if;
end $$;

-- 3) Fix mutable function search_path for functions in public/ops.
do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'ops')
      and (
        p.proconfig is null
        or not exists (
          select 1
          from unnest(p.proconfig) cfg
          where cfg like 'search_path=%'
        )
      )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = %I, pg_temp',
      r.schema_name,
      r.function_name,
      r.identity_args,
      r.schema_name
    );
  end loop;
end $$;

-- 4) Remove API exposure of materialized view flagged by linter.
revoke all on public.dashboard_trip_metrics from anon, authenticated;

-- 5) Remove broad listing policy on public bucket objects.
drop policy if exists "Public can read userprofiles avatars" on storage.objects;

-- 6) Convert exposed SECURITY DEFINER functions in public to SECURITY INVOKER.
--    This removes broad privileged execution via Data API roles.
do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format(
      'alter function %I.%I(%s) security invoker',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  end loop;
end $$;

-- 7) Verification queries.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  p.prosecdef as is_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by 1, 2, 3;

select extname, n.nspname as schema_name
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where extname in ('pg_net', 'pg_trgm')
order by extname;

select schemaname, matviewname
from pg_matviews
where schemaname = 'public'
  and matviewname = 'dashboard_trip_metrics';
