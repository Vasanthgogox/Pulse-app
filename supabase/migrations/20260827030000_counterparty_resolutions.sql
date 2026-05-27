-- Tracks confirmed name→org links and dismissals made by dispatchers.
-- Used to suppress already-resolved names from the discovery list.
--
-- Rollback: DROP TABLE counterparty_resolutions;

CREATE TABLE IF NOT EXISTS counterparty_resolutions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  counterparty_name   text        NOT NULL,
  counterparty_type   text        NOT NULL CHECK (counterparty_type IN ('supplier', 'client')),
  -- NULL when user dismissed without linking (dismissed = true).
  matched_org_id      uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  resolved_by_user_id uuid        NOT NULL REFERENCES profiles(id),
  resolved_at         timestamptz NOT NULL DEFAULT now(),
  -- true = user said "not a match, don't show again"
  dismissed           boolean     NOT NULL DEFAULT false,

  -- One resolution per (org, name, type). Upsert with ON CONFLICT replaces.
  CONSTRAINT uq_counterparty_resolution
    UNIQUE (org_id, counterparty_name, counterparty_type)
);

CREATE INDEX idx_counterparty_resolutions_org
  ON counterparty_resolutions (org_id);

ALTER TABLE counterparty_resolutions ENABLE ROW LEVEL SECURITY;

-- Org members can read and write their own org's resolutions only.
CREATE POLICY "org_members_manage_resolutions"
  ON counterparty_resolutions
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = counterparty_resolutions.org_id
        AND organization_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = counterparty_resolutions.org_id
        AND organization_members.user_id = auth.uid()
    )
  );
