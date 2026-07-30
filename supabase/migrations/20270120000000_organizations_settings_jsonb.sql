-- Org-level settings bag. First consumer: `settings.customRoles` — saved
-- permission presets ({ id, name, surfaces }) reused across members so an
-- admin doesn't re-toggle 15+ surfaces per custom role.
--
-- Writes go through the existing "Users can update organization they own"
-- UPDATE policy (owner_id = auth.uid() OR is_org_admin(id)), so no new policy
-- is needed — only owners/admins can persist presets.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.settings IS
  'Org-scoped settings bag. Keys: customRoles (saved member-permission presets).';
