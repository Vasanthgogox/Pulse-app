-- AdminData Phase — least-privilege session access for the Admin Console's
-- verification workspace, plus an anon lockdown on six unguarded helpers.
--
-- ── Part A: the AdminData RLS gap ────────────────────────────────────────────
-- AdminDataProvider reads six tables (organizations, organization_members,
-- profiles, trips, verification_audit_logs, org_feature_flags) on the
-- service_role key. Every one of those tables is scoped to owners/members only,
-- so a real platform admin on their own session currently sees:
--
--     organizations 0 / members 0 / profiles 3 / trips 0 / audit 0 / flags 0
--     (baseline, as postgres:      61 / 79 / 137 / 215 / 28 / 5)
--
-- org_feature_flags is the starkest case: its ONLY policy is
-- "service role full access", so an admin session reads nothing and its writes
-- fail silently.
--
-- This also blocks the Credits panel, whose organization selector takes its list
-- from this provider: a credits.issue holder sees 12 wallets but 0 organizations.
--
-- Approach: one additive, permissive, admin-only policy per table, each gated on
-- an existing platform permission. PostgreSQL ORs permissive policies, so every
-- owner/member policy keeps working exactly as before -- nothing is weakened,
-- nothing is granted to authenticated users at large, and no policy reproduces
-- service_role's blanket bypass.
--
-- Permission mapping (all keys already exist; no new authorization system):
--   verification.review  -> the verification workspace's read surface
--   verification.approve -> also accepted, since an approver necessarily reviews
--   credits.issue        -> additionally allowed to read organizations ONLY,
--                           because the Credits selector needs id + company_name
--
-- ── Part B: six anon-executable helpers ─────────────────────────────────────
-- Separately found during this audit: six SECURITY DEFINER helpers are
-- executable by anon with no authorization check and a caller-supplied actor id.
--
-- Verified exploitable on the live database: as anon, record_activity() wrote a
-- public activity_stream row attributed to a real super_admin by both id and
-- display name. (Rolled back.) A forged audit/activity entry is credible
-- precisely because it looks identical to a genuine one.
--
-- These are internal plumbing -- called by other definer functions and triggers.
-- Three are also called from the mobile app (emit_event, record_activity via
-- lib/eventService.ts; platform_next_canonical_code via
-- packages/platform/identity), and all three use the app's *authenticated*
-- client. So `authenticated` keeps EXECUTE and only anon loses it; no app flow
-- changes. Their bodies are untouched -- adding actor validation inside them is
-- a larger change that belongs with the code that calls them.

-- ── A1. organizations ────────────────────────────────────────────────────────
-- credits.issue is included here (and only here) so the Credits organization
-- selector works without granting Credits admins anything else.
drop policy if exists organizations_platform_admin_select on public.organizations;
create policy organizations_platform_admin_select on public.organizations
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
    or public.has_platform_permission((select auth.uid()), 'credits.issue')
  );

-- Escalation (AdminDataProvider.escalateApp) updates verification_status back to
-- 'pending'. Restricted to verification.approve -- reviewing is a read-only role.
drop policy if exists organizations_platform_admin_update on public.organizations;
create policy organizations_platform_admin_update on public.organizations
  for update
  to authenticated
  using (public.has_platform_permission((select auth.uid()), 'verification.approve'))
  with check (public.has_platform_permission((select auth.uid()), 'verification.approve'));

-- ── A2. organization_members ─────────────────────────────────────────────────
drop policy if exists org_members_platform_admin_select on public.organization_members;
create policy org_members_platform_admin_select on public.organization_members
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
  );

-- Member suspension (AdminDataProvider.suspendUser).
--
-- NOTE: that client call is `.eq('user_id', userId)` with no organization filter,
-- so it suspends the member in EVERY org they belong to. This policy does not
-- change that behaviour -- it only decides who may perform the update -- but the
-- unscoped write is a real defect worth fixing in the client separately. It is
-- reported rather than silently altered here, because narrowing it changes what
-- the button does.
drop policy if exists org_members_platform_admin_update on public.organization_members;
create policy org_members_platform_admin_update on public.organization_members
  for update
  to authenticated
  using (public.has_platform_permission((select auth.uid()), 'verification.approve'))
  with check (public.has_platform_permission((select auth.uid()), 'verification.approve'));

-- ── A3. profiles ─────────────────────────────────────────────────────────────
-- Narrow, like the driver-KYC reviewer policy: an admin may read the profile of
-- someone who is a member of an organization, which is what the team roster
-- needs. Not "all profiles" -- a user who belongs to no org stays invisible.
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

-- ── A4. trips ────────────────────────────────────────────────────────────────
-- The workspace shows a per-org trip count for the current month. Read-only.
drop policy if exists trips_platform_admin_select on public.trips;
create policy trips_platform_admin_select on public.trips
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
  );

-- ── A5. verification_audit_logs ──────────────────────────────────────────────
-- Read for the audit timeline; insert for escalations. No update/delete policy:
-- the audit trail stays append-only for admins, as it already is for everyone.
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

-- ── A6. org_feature_flags ────────────────────────────────────────────────────
-- Read + write for the governance tab (toggleFeatureFlag upserts, so INSERT and
-- UPDATE are both required). Previously service_role-only.
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

-- ── B. Revoke anon EXECUTE on the six unguarded helpers ─────────────────────
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

-- Internal-only (leading underscore, no client caller found anywhere in the repo).
revoke execute on function public._ensure_mover_asset_trip(uuid, uuid, uuid, text, uuid) from public, anon;
grant  execute on function public._ensure_mover_asset_trip(uuid, uuid, uuid, text, uuid) to authenticated, service_role;
