-- DB performance hardening patch pack
-- Run against linked remote only after taking a backup/snapshot.
-- This file does not alter table schema; it adds supporting indexes and refreshes planner stats.

-- 1) RLS hot-path support: organization membership lookups
create index if not exists idx_org_members_user_org_status
  on public.organization_members (user_id, organization_id, status);

create index if not exists idx_org_members_org_user_status
  on public.organization_members (organization_id, user_id, status);

-- 2) Chat hot-path support
create index if not exists idx_trip_messages_org_conv_created
  on public.trip_messages (organization_id, conversation_id, created_at desc);

create index if not exists idx_trip_messages_conv_created
  on public.trip_messages (conversation_id, created_at desc);

create index if not exists idx_trip_conversations_org_trip
  on public.trip_conversations (organization_id, trip_id);

create index if not exists idx_trip_conversations_driver_org
  on public.trip_conversations (driver_id, organization_id);

-- 3) Trips read/update path support
create index if not exists idx_trips_org_created
  on public.trips (organization_id, created_at desc);

create index if not exists idx_trips_driver_created
  on public.trips (driver_id, created_at desc);

create index if not exists idx_trips_supplier_indent
  on public.trips (supplier_id, indent_id);

-- 4) Driver location read path support (keep append-only writes cheap)
create index if not exists idx_driver_locations_trip_recorded
  on public.driver_locations (trip_id, recorded_at desc)
  where trip_id is not null;

create index if not exists idx_driver_locations_driver_recorded
  on public.driver_locations (driver_id, recorded_at desc);

-- 5) Refresh planner stats after index changes
analyze public.organization_members;
analyze public.trip_messages;
analyze public.trip_conversations;
analyze public.trips;
analyze public.driver_locations;
