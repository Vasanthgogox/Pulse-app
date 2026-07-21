-- Owner-only member role/access control.
--
-- Context: role changes were written directly to organization_members
-- (members.service.updateMemberRole), and org_members_update RLS authorized ANY
-- active owner/admin to update the table — so an admin could re-role teammates.
-- The org owner wants role/access changes to be OWNER-ONLY, enforced server-side
-- and audited. Mirrors the transfer_organization_ownership design (20261210120000)
-- and reuses the is_org_owner() SECURITY DEFINER helper (20261211090000).
--
-- Two parts:
--   1. set_member_role() RPC — owner-only, atomic, audited role/permission write.
--   2. Harden org_members_update RLS — a plain UPDATE may not change role or
--      permissions unless the caller is the current owner. Admins keep other
--      column management (e.g. status); self-row invite accept/reject unaffected.

-- ── 1. Owner-only role write ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_member_role(
  p_member_id  uuid,
  p_role       text,
  p_permissions jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_org_id   uuid;
  v_old_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve the member's org + current role.
  SELECT organization_id, role
    INTO v_org_id, v_old_role
  FROM organization_members
  WHERE id = p_member_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Owner-only. Mirrors useOrgRole().isOwner; is_org_owner is SECURITY DEFINER.
  IF NOT public.is_org_owner(v_org_id) THEN
    RAISE EXCEPTION 'not_org_owner: only the organization owner can change member roles';
  END IF;

  -- The owner row's role only moves via transfer_organization_ownership.
  IF v_old_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_reassign_owner: transfer ownership instead of changing the owner''s role';
  END IF;
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_assign_owner: use transfer ownership to make someone the owner';
  END IF;

  -- Lock the org row so a concurrent transfer can't race the write.
  PERFORM 1 FROM organizations WHERE id = v_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  UPDATE organization_members
     SET role        = p_role,
         permissions = COALESCE(p_permissions, permissions)
   WHERE id = p_member_id;

  INSERT INTO workspace_audit_log (org_id, actor_id, event_type, payload)
  VALUES (
    v_org_id,
    v_uid,
    'member.role_update',
    jsonb_build_object('member_id', p_member_id, 'from', v_old_role, 'to', p_role)
  );

  RETURN jsonb_build_object('ok', true, 'member_id', p_member_id, 'from', v_old_role, 'to', p_role);
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_role(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.set_member_role(uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.set_member_role(uuid, text, jsonb) IS
  'Owner-only atomic member role/permission write. Rejects non-owner callers and any owner-row reassignment; audits member.role_update.';

-- Stored role/permissions of a member row, read with RLS bypassed. Used by the
-- UPDATE policy's WITH CHECK to compare NEW vs stored (OLD) values WITHOUT
-- re-entering organization_members RLS (the recursion class fixed in
-- 20261211090000 — an inline self-subquery inside the policy would recurse).
CREATE OR REPLACE FUNCTION public.member_role_permissions_unchanged(
  p_member_id uuid,
  p_new_role text,
  p_new_permissions jsonb
)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = p_member_id
      AND role = p_new_role
      AND permissions IS NOT DISTINCT FROM p_new_permissions
  );
$$;

REVOKE ALL ON FUNCTION public.member_role_permissions_unchanged(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.member_role_permissions_unchanged(uuid, text, jsonb) TO authenticated;

-- ── 2. Harden org_members_update ─────────────────────────────────────────────
-- Rebuilds the policy from 20261211090000. Same USING clause and same
-- no-self-reference structure (uses is_org_admin/is_org_owner helpers so it does
-- not recurse). New: role/permissions may change only when the caller is the
-- current owner — so an admin can no longer re-role teammates off-RPC, and the
-- set_member_role RPC (SECURITY DEFINER, bypasses RLS) remains the write path.
-- Own-row self-updates (invite accept/reject: status only) still pass because
-- they leave role/permissions unchanged.
DROP POLICY IF EXISTS org_members_update ON public.organization_members;
CREATE POLICY org_members_update ON public.organization_members
  FOR UPDATE
  USING (
    user_id = (select auth.uid())
    or public.is_org_admin(organization_id)
  )
  WITH CHECK (
    (
      user_id = (select auth.uid())
      or public.is_org_admin(organization_id)
    )
    -- Owner promotion stays owner-only (unchanged intent).
    and (
      role <> 'owner'
      or public.is_org_owner(organization_id)
    )
    -- Role / permission changes are owner-only. A row whose role and permissions
    -- are unchanged (self status updates, admin non-role edits) passes for admins;
    -- any role/permission mutation requires the owner.
    and (
      public.is_org_owner(organization_id)
      or public.member_role_permissions_unchanged(id, role, permissions)
    )
  );
