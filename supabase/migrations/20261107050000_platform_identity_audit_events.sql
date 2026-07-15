-- Platform Identity: organization lifecycle status + append-only audit events.

-- ── Organization platform status ─────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS platform_status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (platform_status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED', 'DELETED'));

COMMENT ON COLUMN public.organizations.platform_status IS
  'Platform Identity lifecycle gate — join/switch blocked when not ACTIVE.';

-- ── Audit events (append-only) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_identity_audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  person_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  membership_id   uuid,
  invite_id       uuid,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_identity_audit_org
  ON public.platform_identity_audit_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_identity_audit_person
  ON public.platform_identity_audit_events (person_id, occurred_at DESC);

COMMENT ON TABLE public.platform_identity_audit_events IS
  'Append-only Platform Identity audit trail (invitation, policy, workspace, identity).';

ALTER TABLE public.platform_identity_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_identity_audit_insert ON public.platform_identity_audit_events;
CREATE POLICY platform_identity_audit_insert ON public.platform_identity_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    person_id IS NULL
    OR person_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS platform_identity_audit_select ON public.platform_identity_audit_events;
CREATE POLICY platform_identity_audit_select ON public.platform_identity_audit_events
  FOR SELECT TO authenticated
  USING (
    person_id = (SELECT auth.uid())
    OR (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
    )
  );
