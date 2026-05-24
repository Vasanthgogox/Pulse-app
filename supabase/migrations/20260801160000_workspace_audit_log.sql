-- Audit log for workspace-level mutations (KYC updates, ownership changes, branding edits).
-- Row-level immutability: no deletes, no updates — append-only by design.

CREATE TABLE IF NOT EXISTS workspace_audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id     uuid        NOT NULL REFERENCES auth.users(id),
  event_type   text        NOT NULL,  -- 'kyc.update' | 'branding.update' | 'ownership.transfer' | 'member.invite' | 'member.remove'
  payload      jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_audit_log_org_created
  ON workspace_audit_log (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_audit_log_actor
  ON workspace_audit_log (actor_id);

-- Immutability: deny updates and deletes.
ALTER TABLE workspace_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_admins_insert" ON workspace_audit_log;
DROP POLICY IF EXISTS "audit_log_admins_select" ON workspace_audit_log;

CREATE POLICY "audit_log_admins_insert"
  ON workspace_audit_log FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "audit_log_admins_select"
  ON workspace_audit_log FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Trigger: auto-log KYC field changes on organizations table.
CREATE OR REPLACE FUNCTION log_kyc_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  IF (OLD.business_pan IS DISTINCT FROM NEW.business_pan)
  OR (OLD.gstin IS DISTINCT FROM NEW.gstin)
  OR (OLD.cin IS DISTINCT FROM NEW.cin) THEN
    INSERT INTO workspace_audit_log (org_id, actor_id, event_type, payload)
    VALUES (
      NEW.id,
      auth.uid(),
      'kyc.update',
      jsonb_build_object(
        'before', jsonb_build_object('gstin', OLD.gstin, 'business_pan', OLD.business_pan, 'cin', OLD.cin),
        'after',  jsonb_build_object('gstin', NEW.gstin, 'business_pan', NEW.business_pan, 'cin', NEW.cin)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_kyc_change ON organizations;
CREATE TRIGGER trg_log_kyc_change
  AFTER UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION log_kyc_change();
