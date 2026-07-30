ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.settings IS
  'Org-scoped settings bag. Keys: customRoles (saved member-permission presets).';
