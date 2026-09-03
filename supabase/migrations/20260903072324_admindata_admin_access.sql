drop policy if exists organizations_platform_admin_select on public.organizations;
create policy organizations_platform_admin_select on public.organizations
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
    or public.has_platform_permission((select auth.uid()), 'credits.issue')
  );

drop policy if exists organizations_platform_admin_update on public.organizations;
create policy organizations_platform_admin_update on public.organizations
  for update
  to authenticated
  using (public.has_platform_permission((select auth.uid()), 'verification.approve'))
  with check (public.has_platform_permission((select auth.uid()), 'verification.approve'));

drop policy if exists org_members_platform_admin_select on public.organization_members;
create policy org_members_platform_admin_select on public.organization_members
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
  );

drop policy if exists org_members_platform_admin_update on public.organization_members;
create policy org_members_platform_admin_update on public.organization_members
  for update
  to authenticated
  using (public.has_platform_permission((select auth.uid()), 'verification.approve'))
  with check (public.has_platform_permission((select auth.uid()), 'verification.approve'));

drop policy if exists profiles_platform_admin_select on public.profiles;
create policy profiles_platform_admin_select on public.profiles
  for select
  to authenticated
  using (
    (
      public.has_platform_permission((select auth.uid()), 'verification.review')
      or public.has_platform_permission((select auth.uid()), 'verification.approve')
    )
    and exists (
      select 1 from public.organization_members om
      where om.user_id = profiles.id
    )
  );

drop policy if exists trips_platform_admin_select on public.trips;
create policy trips_platform_admin_select on public.trips
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
  );

drop policy if exists verification_audit_platform_admin_select on public.verification_audit_logs;
create policy verification_audit_platform_admin_select on public.verification_audit_logs
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
  );

drop policy if exists verification_audit_platform_admin_insert on public.verification_audit_logs;
create policy verification_audit_platform_admin_insert on public.verification_audit_logs
  for insert
  to authenticated
  with check (public.has_platform_permission((select auth.uid()), 'verification.approve'));

drop policy if exists org_feature_flags_platform_admin_select on public.org_feature_flags;
create policy org_feature_flags_platform_admin_select on public.org_feature_flags
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
  );

drop policy if exists org_feature_flags_platform_admin_insert on public.org_feature_flags;
create policy org_feature_flags_platform_admin_insert on public.org_feature_flags
  for insert
  to authenticated
  with check (public.has_platform_permission((select auth.uid()), 'verification.approve'));

drop policy if exists org_feature_flags_platform_admin_update on public.org_feature_flags;
create policy org_feature_flags_platform_admin_update on public.org_feature_flags
  for update
  to authenticated
  using (public.has_platform_permission((select auth.uid()), 'verification.approve'))
  with check (public.has_platform_permission((select auth.uid()), 'verification.approve'));

revoke execute on function public.record_activity(text, text, uuid, text, text, uuid, text, text, uuid, jsonb, boolean) from public, anon;
grant  execute on function public.record_activity(text, text, uuid, text, text, uuid, text, text, uuid, jsonb, boolean) to authenticated, service_role;

revoke execute on function public.emit_event(text, text, uuid, jsonb, uuid, uuid, uuid, uuid, jsonb) from public, anon;
grant  execute on function public.emit_event(text, text, uuid, jsonb, uuid, uuid, uuid, uuid, jsonb) to authenticated, service_role;

revoke execute on function public.emit_network_notification(uuid, uuid, text, text, text, numeric, uuid, uuid, uuid, text, jsonb) from public, anon;
grant  execute on function public.emit_network_notification(uuid, uuid, text, text, text, numeric, uuid, uuid, uuid, text, jsonb) to authenticated, service_role;

revoke execute on function public.platform_next_canonical_code(text, integer) from public, anon;
grant  execute on function public.platform_next_canonical_code(text, integer) to authenticated, service_role;

revoke execute on function public.fn_ensure_trip_chat_room_core(uuid, uuid) from public, anon;
grant  execute on function public.fn_ensure_trip_chat_room_core(uuid, uuid) to authenticated, service_role;

revoke execute on function public._ensure_mover_asset_trip(uuid, uuid, uuid, text, uuid) from public, anon;
grant  execute on function public._ensure_mover_asset_trip(uuid, uuid, uuid, text, uuid) to authenticated, service_role;