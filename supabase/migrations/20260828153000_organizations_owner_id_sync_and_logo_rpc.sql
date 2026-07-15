-- Fix organizations with owner_id NULL but an active owner in organization_members.
-- Broaden UPDATE RLS to is_org_admin (matches update_workspace_kyc).
-- RPC for logo updates; trigger keeps owner_id in sync on new owner memberships.

-- Backfill existing rows
UPDATE public.organizations o
SET owner_id = om.user_id,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (organization_id)
    organization_id,
    user_id
  FROM public.organization_members
  WHERE role = 'owner'
    AND status = 'active'
  ORDER BY organization_id, created_at ASC NULLS LAST, user_id
) om
WHERE o.id = om.organization_id
  AND o.owner_id IS NULL;

-- Keep owner_id aligned when the first owner membership is created or re-activated
CREATE OR REPLACE FUNCTION public.sync_organization_owner_from_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'owner' AND NEW.status = 'active' THEN
    UPDATE public.organizations
    SET owner_id = NEW.user_id,
        updated_at = now()
    WHERE id = NEW.organization_id
      AND owner_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_org_owner_from_member ON public.organization_members;
CREATE TRIGGER trg_sync_org_owner_from_member
  AFTER INSERT OR UPDATE OF role, status ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_organization_owner_from_member();

-- RLS: owners by column OR active owner/admin membership
DROP POLICY IF EXISTS "Users can update organization they own" ON public.organizations;

CREATE POLICY "Users can update organization they own"
  ON public.organizations
  FOR UPDATE
  USING (
    owner_id = (SELECT auth.uid())
    OR public.is_org_admin(id)
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    OR public.is_org_admin(id)
  );

-- Logo path update (SECURITY DEFINER; same auth model as update_workspace_kyc)
CREATE OR REPLACE FUNCTION public.update_organization_logo(
  p_org_id uuid,
  p_logo_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can update the workspace logo.';
  END IF;

  UPDATE public.organizations
  SET
    logo_url = p_logo_url,
    updated_at = now()
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_organization_logo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_organization_logo(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.update_organization_logo(uuid, text) IS
  'Sets organizations.logo_url for org admins/owners (membership-based).';
