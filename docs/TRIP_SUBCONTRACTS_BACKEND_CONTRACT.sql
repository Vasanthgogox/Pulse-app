-- Trip subcontracts (private-to-viewer org)
-- Purpose: allow a carrier org (e.g. awarded supplier B) to record a downstream supplier + rate
-- for a trip they can see (often load-based trips owned by shipper A) WITHOUT writing to public.trips.
--
-- NOTE: Do not apply in pulse. This is a backend contract intended for pulse-unified-base
-- supabase/migrations/ (shared DB). Kept here so mobile + backend stay aligned.
--
-- Core invariants:
-- - Canonical trip row is unchanged (owned by shipper).
-- - Subcontract visibility is limited to viewer_org members only.
-- - Enforce supplier_id belongs to viewer_org_id (prevents tagging outside org).
--
-- Table
create table if not exists public.trip_subcontracts (
  id uuid primary key default gen_random_uuid(),
  viewer_org_id uuid not null references public.organizations(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  rate numeric not null default 0,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (viewer_org_id, trip_id)
);

create index if not exists idx_trip_subcontracts_viewer_org on public.trip_subcontracts(viewer_org_id);
create index if not exists idx_trip_subcontracts_trip on public.trip_subcontracts(trip_id);

-- Keep updated_at fresh
drop trigger if exists trip_subcontracts_updated_at on public.trip_subcontracts;
create trigger trip_subcontracts_updated_at
before update on public.trip_subcontracts
for each row execute function public.set_updated_at();

alter table public.trip_subcontracts enable row level security;

-- RLS: only members of viewer_org_id
drop policy if exists "Org members can read their trip subcontracts" on public.trip_subcontracts;
create policy "Org members can read their trip subcontracts"
on public.trip_subcontracts for select
using (
  public.is_org_member(viewer_org_id)
);

drop policy if exists "Org members can insert their trip subcontracts" on public.trip_subcontracts;
create policy "Org members can insert their trip subcontracts"
on public.trip_subcontracts for insert
with check (
  public.is_org_member(viewer_org_id)
);

drop policy if exists "Org members can update their trip subcontracts" on public.trip_subcontracts;
create policy "Org members can update their trip subcontracts"
on public.trip_subcontracts for update
using (
  public.is_org_member(viewer_org_id)
)
with check (
  public.is_org_member(viewer_org_id)
);

-- RPC: upsert (SECURITY DEFINER to allow write without exposing broader table perms)
create or replace function public.upsert_trip_subcontract(
  p_viewer_org_id uuid,
  p_trip_id uuid,
  p_supplier_id uuid,
  p_rate numeric
)
returns public.trip_subcontracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.trip_subcontracts%rowtype;
  v_supplier_org uuid;
begin
  if p_viewer_org_id is null or p_trip_id is null or p_supplier_id is null then
    raise exception 'viewer_org_id, trip_id, supplier_id are required';
  end if;
  if not public.is_org_member(p_viewer_org_id) then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_rate, 0) < 0 then
    raise exception 'Rate must be >= 0';
  end if;

  select s.organization_id into v_supplier_org
  from public.suppliers s
  where s.id = p_supplier_id;
  if not found then
    raise exception 'Supplier not found';
  end if;
  if v_supplier_org <> p_viewer_org_id then
    raise exception 'Supplier must belong to viewer org';
  end if;

  insert into public.trip_subcontracts (
    viewer_org_id, trip_id, supplier_id, rate, created_by
  ) values (
    p_viewer_org_id, p_trip_id, p_supplier_id, coalesce(p_rate, 0), auth.uid()
  )
  on conflict (viewer_org_id, trip_id) do update set
    supplier_id = excluded.supplier_id,
    rate = excluded.rate,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.upsert_trip_subcontract(uuid, uuid, uuid, numeric) from public;
grant execute on function public.upsert_trip_subcontract(uuid, uuid, uuid, numeric) to authenticated;

-- RPC: bulk fetch for finance aggregation
create or replace function public.get_trip_subcontracts(
  p_viewer_org_id uuid,
  p_trip_ids uuid[]
)
returns setof public.trip_subcontracts
language sql
security definer
set search_path = public
stable
as $$
  select ts.*
  from public.trip_subcontracts ts
  where ts.viewer_org_id = p_viewer_org_id
    and public.is_org_member(p_viewer_org_id)
    and (p_trip_ids is null or ts.trip_id = any(p_trip_ids));
$$;

revoke all on function public.get_trip_subcontracts(uuid, uuid[]) from public;
grant execute on function public.get_trip_subcontracts(uuid, uuid[]) to authenticated;

