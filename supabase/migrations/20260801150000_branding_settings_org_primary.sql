-- Migrate branding_settings to be org-scoped with a canonical upsert key.
-- Adds org_id column (FK → organizations) with UNIQUE constraint so
-- syncBrandingFromOrg() can upsert by org_id rather than a row-order fallback.

ALTER TABLE IF EXISTS branding_settings
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Unique constraint so upsert(onConflict: 'org_id') works correctly.
CREATE UNIQUE INDEX IF NOT EXISTS branding_settings_org_id_unique
  ON branding_settings (org_id)
  WHERE org_id IS NOT NULL;

-- RLS: members of the org can read; admin/owner can write.
ALTER TABLE branding_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_read_branding"    ON branding_settings;
DROP POLICY IF EXISTS "org_admins_write_branding"    ON branding_settings;

CREATE POLICY "org_members_read_branding"
  ON branding_settings FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_admins_write_branding"
  ON branding_settings FOR ALL
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
