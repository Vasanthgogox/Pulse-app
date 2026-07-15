-- Persist Add Trip form fields in a structured way on trips.
alter table public.trips
  add column if not exists load_tons numeric(10,2);

alter table public.trips
  add column if not exists advance_paid numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_load_tons_nonnegative'
  ) then
    alter table public.trips
      add constraint trips_load_tons_nonnegative
      check (load_tons is null or load_tons >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_advance_paid_nonnegative'
  ) then
    alter table public.trips
      add constraint trips_advance_paid_nonnegative
      check (advance_paid >= 0);
  end if;
end $$;
