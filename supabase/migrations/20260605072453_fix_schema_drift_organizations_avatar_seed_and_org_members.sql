-- ════════════════════════════════════════════════════════════════════════════
-- Fix: schema drift — organizations.avatar_seed, organization_members columns,
--      RLS policies, and missing get_org_members_with_profiles RPC
--
-- Root cause: a prior migration dropped these without updating app code,
-- causing repeated query errors that exhausted the connection pool → DB down.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. organizations.avatar_seed ─────────────────────────────────────────────
-- Queried by bids.service.ts, networkProfileSnapshot.service.ts, and all
-- network-layer org identity rendering. Was removed by a prior migration but
-- never removed from app queries.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS avatar_seed text;


-- ── 2. organization_members: missing columns ─────────────────────────────────
-- members.service.ts writes `permissions` and `joined_at` on every invite.
-- Without them, inserts silently drop these fields; reads return null.
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS joined_at   timestamptz NOT NULL DEFAULT now();

-- Backfill joined_at for existing rows so ORDER BY joined_at is stable.
UPDATE public.organization_members
SET joined_at = created_at
WHERE joined_at = now() AND created_at IS NOT NULL;


-- ── 3. RLS — SELECT policy fix ───────────────────────────────────────────────
-- Old policy: "user_id = auth.uid()" → only own row visible.
-- Problem: org admins loading the roster hit RLS and got 0 rows, causing
-- getOrganizationMembers() to call the fallback on every single request.
-- Fix: use existing SECURITY DEFINER is_org_member(org_id) helper (safe,
-- no recursion risk) to let active org members see the full roster.
DROP POLICY IF EXISTS "Users can read own memberships" ON public.organization_members;

CREATE POLICY "org_members_read_roster"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (
    -- own row always visible (invitees checking their own status)
    user_id = (SELECT auth.uid())
    -- active member of this org sees the full roster
    OR public.is_org_member(organization_id)
  );


-- ── 4. RLS — INSERT policy fix ───────────────────────────────────────────────
-- Old policy: only owner self-join. Blocked admin-initiated invites entirely.
DROP POLICY IF EXISTS "organization_members_owner_self_join" ON public.organization_members;

CREATE POLICY "org_members_insert"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Owner self-join at org creation
    (
      user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = organization_id
          AND owner_id = (SELECT auth.uid())
      )
    )
    OR
    -- Active admin or owner inviting a new member
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id   = (SELECT auth.uid())
        AND om.role      IN ('owner', 'admin')
        AND om.status    = 'active'
    )
  );


-- ── 5. RLS — UPDATE policy (was missing entirely) ────────────────────────────
-- Without this, acceptTeamInvite / rejectTeamInvite / updateMemberRole all
-- silently returned 0 rows updated — no error, no effect.
DROP POLICY IF EXISTS "org_members_update" ON public.organization_members;

CREATE POLICY "org_members_update"
  ON public.organization_members FOR UPDATE
  TO authenticated
  USING (
    -- member updating own row (accept / reject invite)
    user_id = (SELECT auth.uid())
    OR
    -- admin/owner managing team
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role    IN ('owner', 'admin')
        AND om.status  = 'active'
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role    IN ('owner', 'admin')
        AND om.status  = 'active'
    )
  );


-- ── 6. RPC: get_org_members_with_profiles ────────────────────────────────────
-- Called by members.service.ts on every team-management screen.
-- SECURITY DEFINER so it can join profiles without exposing profiles to
-- unauthenticated callers. Auth guard: caller must be active/invited in org.
-- search_path = '' prevents search_path injection.
CREATE OR REPLACE FUNCTION public.get_org_members_with_profiles(p_org_id uuid)
  RETURNS TABLE(
    id              uuid,
    organization_id uuid,
    user_id         uuid,
    role            text,
    status          text,
    permissions     jsonb,
    joined_at       timestamptz,
    full_name       text,
    email           text,
    avatar_url      text,
    avatar_seed     text,
    phone           text
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT
    om.id,
    om.organization_id,
    om.user_id,
    om.role,
    om.status,
    om.permissions,
    om.joined_at,
    p.full_name,
    p.email,
    p.avatar_url,
    p.avatar_seed,
    p.phone
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.id = om.user_id
  WHERE om.organization_id = p_org_id
    AND om.status <> 'inactive'
    AND EXISTS (
      SELECT 1 FROM public.organization_members caller
      WHERE caller.organization_id = p_org_id
        AND caller.user_id = (SELECT auth.uid())
        AND caller.status IN ('active', 'invited')
    )
  ORDER BY om.joined_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_members_with_profiles(uuid) TO authenticated;
