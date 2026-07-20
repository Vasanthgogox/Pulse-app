-- Operating-model switching (Asset / Aggregate / Hybrid) after signup.
-- Owner-only, 30-day cooldown, audited. Pure column flip — no data is deleted;
-- capability gates hide surfaces the new model can't reach (reversible on re-upgrade).

-- 1. Track when the model last changed (drives the cooldown).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS operating_model_changed_at timestamptz;

-- 2. Owner-only, cooldown-guarded, audited switch.
CREATE OR REPLACE FUNCTION change_operating_model(
  p_org_id uuid,
  p_new_model text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_old_model    text;
  v_changed_at   timestamptz;
  v_cooldown     interval := interval '30 days';
  v_aggregated   boolean;
  v_asset        boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_model NOT IN ('ASSET_BASED', 'NON_ASSET', 'HYBRID') THEN
    RAISE EXCEPTION 'Invalid operating model: %', p_new_model;
  END IF;

  -- Owner-only. Mirrors organizations RLS (owner_id) and useOrgRole.isOwner.
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = v_uid
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the organization owner can change the operating model';
  END IF;

  SELECT operating_model, operating_model_changed_at
    INTO v_old_model, v_changed_at
    FROM organizations
   WHERE id = p_org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- No-op: nothing to change, no cooldown consumed.
  IF v_old_model = p_new_model THEN
    RETURN jsonb_build_object('ok', true, 'from', v_old_model, 'to', p_new_model, 'changed', false);
  END IF;

  -- Cooldown. Message text is matched client-side (looksLikeModelChangeCooldownError).
  IF v_changed_at IS NOT NULL AND v_changed_at > now() - v_cooldown THEN
    RAISE EXCEPTION 'operating_model_change_cooldown: you can change the operating model again after %', (v_changed_at + v_cooldown);
  END IF;

  -- Derived flags for profile sync (org model wins at runtime, but keep them aligned).
  v_aggregated := p_new_model IN ('NON_ASSET', 'HYBRID');
  v_asset      := p_new_model IN ('ASSET_BASED', 'HYBRID');

  UPDATE organizations
     SET operating_model = p_new_model,
         operating_model_changed_at = now()
   WHERE id = p_org_id;

  -- Keep member profile flags aligned to avoid drift on hydration fallback.
  UPDATE profiles p
     SET aggregated = v_aggregated,
         asset = v_asset
    FROM organization_members m
   WHERE m.organization_id = p_org_id
     AND m.user_id = p.id;

  INSERT INTO workspace_audit_log (org_id, actor_id, event_type, payload)
  VALUES (
    p_org_id,
    v_uid,
    'model.update',
    jsonb_build_object('from', v_old_model, 'to', p_new_model)
  );

  RETURN jsonb_build_object('ok', true, 'from', v_old_model, 'to', p_new_model, 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION change_operating_model(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION change_operating_model(uuid, text) TO authenticated;
