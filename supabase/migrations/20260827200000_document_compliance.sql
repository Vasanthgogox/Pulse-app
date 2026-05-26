-- entity_documents: polymorphic document store
CREATE TABLE entity_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('vehicle', 'driver', 'supplier', 'organization')),
  entity_id uuid NOT NULL,
  doc_type text NOT NULL,   -- 'insurance','rc','fitness','permit','pollution','license','medical','kyc','aadhar','pan','gst','agreement'
  doc_label text,
  doc_number text,
  issued_date date,
  expiry_date date,
  issued_by text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active', 'expired', 'pending', 'verified', 'rejected', 'replaced')),
  storage_path text,
  notes text,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  replaced_by_id uuid REFERENCES entity_documents(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- document_audit_log: immutable audit trail
CREATE TABLE document_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES entity_documents(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','updated','verified','rejected','replaced','deleted','downloaded')),
  actor_id uuid REFERENCES auth.users(id),
  old_status text,
  new_status text,
  notes text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_entity_docs_entity ON entity_documents (organization_id, entity_type, entity_id);
CREATE INDEX idx_entity_docs_expiry ON entity_documents (organization_id, expiry_date DESC NULLS LAST)
  WHERE expiry_date IS NOT NULL AND status IN ('active','verified','pending');
CREATE INDEX idx_entity_docs_status ON entity_documents (organization_id, status);
CREATE INDEX idx_entity_docs_type ON entity_documents (organization_id, doc_type);
CREATE INDEX idx_doc_audit_entity ON document_audit_log (organization_id, entity_id);

-- Updated_at trigger (uses existing public.set_updated_at function)
CREATE TRIGGER set_entity_documents_updated_at
  BEFORE UPDATE ON entity_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE entity_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_member_read_write" ON entity_documents FOR ALL
  USING (organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "org_member_read_audit" ON document_audit_log FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "org_member_insert_audit" ON document_audit_log FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid()));

-- RPC: get_compliance_summary — returns per-entity-type doc counts and expiry stats
CREATE OR REPLACE FUNCTION get_compliance_summary(p_org_id uuid)
RETURNS TABLE (
  entity_type   text,
  total_docs    bigint,
  active_docs   bigint,
  expired_docs  bigint,
  expiring_7d   bigint,
  expiring_30d  bigint,
  pending_docs  bigint,
  verified_docs bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH _access AS (
    SELECT 1 FROM org_members WHERE organization_id = p_org_id AND user_id = auth.uid() LIMIT 1
  )
  SELECT
    entity_type,
    COUNT(*) AS total_docs,
    COUNT(*) FILTER (WHERE status = 'active') AS active_docs,
    COUNT(*) FILTER (WHERE status = 'expired' OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)) AS expired_docs,
    COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '7 days' AND status NOT IN ('replaced','rejected')) AS expiring_7d,
    COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND status NOT IN ('replaced','rejected')) AS expiring_30d,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending_docs,
    COUNT(*) FILTER (WHERE status = 'verified') AS verified_docs
  FROM entity_documents
  WHERE organization_id = p_org_id AND EXISTS (SELECT 1 FROM _access)
  GROUP BY entity_type;
$$;

-- RPC: get_expiring_documents — for alert/timeline UI
CREATE OR REPLACE FUNCTION get_expiring_documents(p_org_id uuid, p_days_ahead int DEFAULT 30)
RETURNS TABLE (
  id           uuid,
  entity_type  text,
  entity_id    uuid,
  doc_type     text,
  doc_label    text,
  doc_number   text,
  expiry_date  date,
  days_until   int,
  status       text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH _access AS (
    SELECT 1 FROM org_members WHERE organization_id = p_org_id AND user_id = auth.uid() LIMIT 1
  )
  SELECT id, entity_type, entity_id, doc_type, doc_label, doc_number, expiry_date,
         (expiry_date - CURRENT_DATE)::int AS days_until,
         status
  FROM entity_documents
  WHERE organization_id = p_org_id
    AND expiry_date IS NOT NULL
    AND expiry_date >= CURRENT_DATE - INTERVAL '1 day'
    AND expiry_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval
    AND status NOT IN ('replaced', 'rejected')
    AND EXISTS (SELECT 1 FROM _access)
  ORDER BY expiry_date ASC;
$$;

GRANT EXECUTE ON FUNCTION get_compliance_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_expiring_documents(uuid, int) TO authenticated;
