-- Platform Identity — invitations and invite tokens (Phase 1A Sprint 1)

CREATE TABLE IF NOT EXISTS platform.invitations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL,
  organization_id     uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  email               text NOT NULL,
  role_id             smallint NOT NULL REFERENCES platform.roles (id) ON DELETE RESTRICT,
  business_unit_id    uuid REFERENCES platform.business_units (id) ON DELETE SET NULL,
  invited_by_user_id  uuid REFERENCES platform.users (id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_code_format CHECK (code ~ '^INV-[0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_code
  ON platform.invitations (code);

CREATE INDEX IF NOT EXISTS idx_invitations_org_email_pending
  ON platform.invitations (organization_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_invitations_expires
  ON platform.invitations (expires_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS platform.invite_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES platform.invitations (id) ON DELETE CASCADE,
  token_hash    text NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invite_tokens_hash_not_empty CHECK (length(token_hash) >= 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invite_tokens_hash
  ON platform.invite_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_invitation
  ON platform.invite_tokens (invitation_id)
  WHERE used_at IS NULL;

CREATE TRIGGER set_platform_invitations_updated_at
  BEFORE UPDATE ON platform.invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON platform.invitations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.invite_tokens TO authenticated, service_role;
