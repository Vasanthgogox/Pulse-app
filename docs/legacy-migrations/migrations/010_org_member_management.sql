-- Migration: Org member management RPCs
-- Adds RPC functions for team member management (invite, list, remove, role change).
-- The organization_members table and RLS already exist in 001_initial_schema_consolidated.sql.

-- ─── List members with profile data ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."get_org_members_with_profiles"("p_org_id" "uuid")
RETURNS TABLE(
  "id" "uuid",
  "organization_id" "uuid",
  "user_id" "uuid",
  "role" "text",
  "status" "text",
  "permissions" "jsonb",
  "joined_at" timestamp with time zone,
  "full_name" "text",
  "phone" "text",
  "email" "text",
  "avatar_url" "text",
  "company_name" "text"
)
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
begin
  -- Only allow org members to list their own org's members.
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  ) then
    return;
  end if;

  return query
    select
      om.id,
      om.organization_id,
      om.user_id,
      om.role,
      om.status,
      om.permissions,
      om.joined_at,
      coalesce(pr.full_name, '') as full_name,
      coalesce(pr.phone, '') as phone,
      coalesce(pr.email, '') as email,
      pr.avatar_url,
      pr.company_name
    from public.organization_members om
    left join public.profiles pr on pr.id = om.user_id
    where om.organization_id = p_org_id
      and om.status != 'inactive'
    order by
      case om.role
        when 'owner' then 0
        when 'admin' then 1
        else 2
      end,
      om.joined_at asc;
end;
$$;

ALTER FUNCTION "public"."get_org_members_with_profiles"("p_org_id" "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."get_org_members_with_profiles"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members_with_profiles"("p_org_id" "uuid") TO "service_role";

COMMENT ON FUNCTION "public"."get_org_members_with_profiles"("p_org_id" "uuid") IS
  'Returns all active and invited organization_members with joined profile data. Caller must be an active member of the org.';


-- ─── Look up a user profile by phone (for team invite) ────────────────────────
CREATE OR REPLACE FUNCTION "public"."get_user_profile_by_phone"("p_phone" "text")
RETURNS TABLE(
  "user_id" "uuid",
  "full_name" "text",
  "phone" "text",
  "email" "text",
  "avatar_url" "text",
  "role" "text"
)
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
declare
  v_normalized text;
begin
  v_normalized := trim(regexp_replace(coalesce(p_phone, ''), '\s+', '', 'g'));
  if v_normalized = '' then
    return;
  end if;

  return query
    select
      pr.id as user_id,
      coalesce(pr.full_name, '') as full_name,
      coalesce(pr.phone, '') as phone,
      coalesce(pr.email, '') as email,
      pr.avatar_url,
      pr.role
    from public.profiles pr
    where trim(regexp_replace(coalesce(pr.phone, ''), '\s+', '', 'g')) = v_normalized
    limit 1;
end;
$$;

ALTER FUNCTION "public"."get_user_profile_by_phone"("p_phone" "text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."get_user_profile_by_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_profile_by_phone"("p_phone" "text") TO "service_role";

COMMENT ON FUNCTION "public"."get_user_profile_by_phone"("p_phone" "text") IS
  'Returns profile info for any user with the given phone number (for team invite by phone).';


-- ─── Accept team invite (invitee → active) ────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."accept_team_invite"("p_org_id" "uuid")
RETURNS void
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
begin
  update public.organization_members
  set status = 'active', joined_at = coalesce(joined_at, now())
  where organization_id = p_org_id
    and user_id = auth.uid()
    and status = 'invited';
end;
$$;

ALTER FUNCTION "public"."accept_team_invite"("p_org_id" "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."accept_team_invite"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_team_invite"("p_org_id" "uuid") TO "service_role";

COMMENT ON FUNCTION "public"."accept_team_invite"("p_org_id" "uuid") IS
  'Invitee accepts their pending team invite, setting status to active.';


-- ─── Reject / decline team invite ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."reject_team_invite"("p_org_id" "uuid")
RETURNS void
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
begin
  update public.organization_members
  set status = 'inactive'
  where organization_id = p_org_id
    and user_id = auth.uid()
    and status = 'invited';
end;
$$;

ALTER FUNCTION "public"."reject_team_invite"("p_org_id" "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."reject_team_invite"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_team_invite"("p_org_id" "uuid") TO "service_role";

COMMENT ON FUNCTION "public"."reject_team_invite"("p_org_id" "uuid") IS
  'Invitee declines their pending team invite, setting status to inactive.';


-- ─── List pending invites for the current user (invitee inbox) ────────────────
CREATE OR REPLACE FUNCTION "public"."get_my_team_invites"()
RETURNS TABLE(
  "id" "uuid",
  "organization_id" "uuid",
  "role" "text",
  "joined_at" timestamp with time zone,
  "org_name" "text"
)
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
begin
  return query
    select
      om.id,
      om.organization_id,
      om.role,
      om.joined_at,
      coalesce(o.name, '') as org_name
    from public.organization_members om
    left join public.organizations o on o.id = om.organization_id
    where om.user_id = auth.uid()
      and om.status = 'invited'
    order by om.joined_at desc;
end;
$$;

ALTER FUNCTION "public"."get_my_team_invites"() OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."get_my_team_invites"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_team_invites"() TO "service_role";

COMMENT ON FUNCTION "public"."get_my_team_invites"() IS
  'Returns all pending organization_member invites for the current user, with org name.';
