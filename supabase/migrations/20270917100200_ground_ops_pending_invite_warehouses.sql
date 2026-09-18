-- Ground Ops warehouse assignment for the pending-invite (new-signup) path.
--
-- A ground_ops invite to a brand-new phone number goes through
-- create_team_invite_pending -> organization_team_invites, with NO
-- organization_members row until the invitee signs up and calls
-- accept_pending_team_invitation. The chosen warehouse IDs are stashed on
-- organization_team_invites.permissions -> 'warehouseIds' (app-side, see
-- buildTeamInvitePermissions / createPendingTeamInvite) and must be
-- replayed into organization_member_warehouses at claim time.
--
-- The existing-user immediate-invite path (invite_existing_user_to_org)
-- creates the organization_members row synchronously, so the app writes
-- organization_member_warehouses directly right after that call — no RPC
-- change needed there.

BEGIN;

CREATE OR REPLACE FUNCTION public.accept_pending_team_invitation(p_invite_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_inv         public.organization_team_invites%ROWTYPE;
  v_profile     public.profiles%ROWTYPE;
  v_member_id   uuid;
  v_canon       text;
  v_existing    public.organization_members%ROWTYPE;
  v_warehouse_ids jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv
  FROM public.organization_team_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_inv.status = 'accepted' THEN
    SELECT om.id INTO v_member_id
    FROM public.organization_members om
    WHERE om.organization_id = v_inv.organization_id
      AND om.user_id = v_uid
      AND om.status IN ('active', 'invited')
    LIMIT 1;
    RETURN jsonb_build_object(
      'organization_id', v_inv.organization_id,
      'membership_id', v_member_id,
      'already_accepted', true
    );
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer valid';
  END IF;

  IF v_inv.expires_at <= now() THEN
    UPDATE public.organization_team_invites
    SET status = 'expired', updated_at = now()
    WHERE id = v_inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  v_canon := public.normalize_phone_canon(v_profile.phone);
  IF v_canon IS NULL OR v_canon <> v_inv.invitee_phone_canon THEN
    RAISE EXCEPTION 'Phone number does not match this invitation';
  END IF;

  SELECT * INTO v_existing
  FROM public.organization_members
  WHERE organization_id = v_inv.organization_id
    AND user_id = v_uid;

  IF FOUND THEN
    IF v_existing.status = 'active' THEN
      UPDATE public.organization_team_invites
      SET status = 'accepted', accepted_user_id = v_uid, updated_at = now()
      WHERE id = v_inv.id;
      RETURN jsonb_build_object(
        'organization_id', v_inv.organization_id,
        'membership_id', v_existing.id,
        'already_member', true
      );
    END IF;

    UPDATE public.organization_members
    SET
      role        = v_inv.role,
      permissions = v_inv.permissions,
      status      = 'active',
      joined_at   = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_member_id;
  ELSE
    INSERT INTO public.organization_members (
      organization_id, user_id, role, status, permissions, joined_at
    ) VALUES (
      v_inv.organization_id,
      v_uid,
      v_inv.role,
      'active',
      v_inv.permissions,
      now()
    )
    RETURNING id INTO v_member_id;
  END IF;

  -- Replay warehouse assignment for ground_ops invites (see migration header).
  IF COALESCE(v_inv.permissions ->> 'platformRole', '') = 'ground_ops' THEN
    v_warehouse_ids := v_inv.permissions -> 'warehouseIds';
    IF v_warehouse_ids IS NOT NULL AND jsonb_typeof(v_warehouse_ids) = 'array' THEN
      INSERT INTO public.organization_member_warehouses (organization_member_id, warehouse_id)
      SELECT v_member_id, (elem)::uuid
      FROM jsonb_array_elements_text(v_warehouse_ids) AS elem
      JOIN public.client_warehouses cw
        ON cw.id = (elem)::uuid
       AND cw.organization_id = v_inv.organization_id
       AND cw.deleted_at IS NULL
      ON CONFLICT (organization_member_id, warehouse_id) DO NOTHING;
    END IF;
  END IF;

  UPDATE public.organization_team_invites
  SET
    status           = 'accepted',
    accepted_user_id = v_uid,
    updated_at       = now()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'organization_id', v_inv.organization_id,
    'membership_id', v_member_id,
    'already_member', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_pending_team_invitation(uuid) TO authenticated;

COMMIT;
