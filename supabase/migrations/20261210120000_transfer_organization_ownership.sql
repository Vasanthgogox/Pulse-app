-- Organization ownership transfer (GitHub/Slack-style).
-- Owner-only, atomic, audited. The current owner picks an active member; the
-- owner steps down to admin and the member becomes owner in one transaction.
--
-- Why an RPC and not three client writes: `organizations.owner_id` and the
-- `organization_members` role='owner' row are two sources of truth, only synced
-- once (sync_organization_owner_from_member fires only while owner_id IS NULL).
-- A transfer must flip both explicitly and atomically, or the workspace ends up
-- with two owners / none. RLS also lets admins set any role today, so promotion
-- to owner is locked to this RPC below.

-- 1. Owner-only, atomic, audited transfer.
CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(
  p_org_id uuid,
  p_new_owner_user_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_owner_user_id = v_uid THEN
    RAISE EXCEPTION 'transfer_target_not_member: you already own this workspace';
  END IF;

  -- Caller must be the current owner. Mirrors useOrgRole.isOwner.
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = v_uid
      AND role = 'owner'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only the organization owner can transfer ownership';
  END IF;

  -- Target must be an active member (not pending, not a stranger).
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = p_new_owner_user_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'transfer_target_not_member: the chosen person must be an active member of this workspace';
  END IF;

  -- Lock the org row so owner_id can't race a concurrent transfer.
  PERFORM 1 FROM organizations WHERE id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Demote current owner → admin.
  UPDATE organization_members
     SET role = 'admin'
   WHERE organization_id = p_org_id
     AND user_id = v_uid
     AND role = 'owner';

  -- Promote target → owner.
  UPDATE organization_members
     SET role = 'owner'
   WHERE organization_id = p_org_id
     AND user_id = p_new_owner_user_id;

  -- Flip owner_id explicitly — the sync trigger no-ops once owner_id is set.
  UPDATE organizations
     SET owner_id = p_new_owner_user_id,
         updated_at = now()
   WHERE id = p_org_id;

  INSERT INTO workspace_audit_log (org_id, actor_id, event_type, payload)
  VALUES (
    p_org_id,
    v_uid,
    'ownership.transfer',
    jsonb_build_object('from_user', v_uid, 'to_user', p_new_owner_user_id)
  );

  RETURN jsonb_build_object('ok', true, 'from', v_uid, 'to', p_new_owner_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_organization_ownership(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.transfer_organization_ownership(uuid, uuid) IS
  'Owner-only atomic ownership transfer: demotes caller to admin, promotes target to owner, syncs organizations.owner_id, audits ownership.transfer.';

-- 2. Harden org_members_update: an admin can manage the team but must NOT be
-- able to mint a new owner directly. Owner promotion is reachable only through
-- transfer_organization_ownership (SECURITY DEFINER, bypasses RLS). Own-row
-- self-updates (invite accept/reject) are unaffected — an invitee can't set
-- themselves owner because their pre-image role is not 'owner'.
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
    (
      user_id = (SELECT auth.uid())
      OR
      EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = organization_members.organization_id
          AND om.user_id = (SELECT auth.uid())
          AND om.role    IN ('owner', 'admin')
          AND om.status  = 'active'
      )
    )
    -- Nobody may write role='owner' through plain RLS: only the current owner
    -- may, and only the transfer RPC needs it (and it bypasses RLS anyway).
    AND (
      role <> 'owner'
      OR EXISTS (
        SELECT 1 FROM public.organization_members owner_row
        WHERE owner_row.organization_id = organization_members.organization_id
          AND owner_row.user_id = (SELECT auth.uid())
          AND owner_row.role    = 'owner'
          AND owner_row.status  = 'active'
      )
    )
  );
