-- Platform Identity — core entities (Phase 1A Sprint 1)
-- Physical model: oms/docs/PLATFORM_ENTITY_MODEL.md
-- Contract: oms/docs/api/identity-v1.yaml
--
-- Isolated in `platform` schema. Legacy fleet/commerce continues on public.organizations
-- until bridged via platform.organizations.legacy_organization_id.

CREATE SCHEMA IF NOT EXISTS platform;

COMMENT ON SCHEMA platform IS
  'Pulse Platform bounded context — Identity, Command Store, Timeline (future).';

-- ── Canonical ID generation ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.entity_counters (
  prefix     text PRIMARY KEY,
  next_value bigint NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION platform.next_canonical_code(
  p_prefix text,
  p_width  int DEFAULT 6
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = platform, pg_catalog
AS $$
DECLARE
  v_next bigint;
BEGIN
  INSERT INTO platform.entity_counters AS ec (prefix, next_value)
  VALUES (p_prefix, 1)
  ON CONFLICT (prefix) DO UPDATE
    SET next_value = ec.next_value + 1
  RETURNING next_value INTO v_next;

  RETURN p_prefix || '-' || lpad(v_next::text, p_width, '0');
END;
$$;

-- ── Tenants ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tenants_code_format CHECK (code ~ '^TENANT-[0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_code_active
  ON platform.tenants (code)
  WHERE deleted_at IS NULL;

-- ── Organizations ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.organizations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    text NOT NULL,
  tenant_id               uuid NOT NULL REFERENCES platform.tenants (id) ON DELETE RESTRICT,
  name                    text NOT NULL,
  legal_name              text,
  legacy_organization_id  uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz,
  CONSTRAINT organizations_code_format CHECK (code ~ '^ORG-[0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_code_active
  ON platform.organizations (code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_legacy_org
  ON platform.organizations (legacy_organization_id)
  WHERE legacy_organization_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_tenant
  ON platform.organizations (tenant_id)
  WHERE deleted_at IS NULL;

-- ── Business units ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.business_units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL,
  organization_id uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  name            text NOT NULL,
  unit_code       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT business_units_code_format CHECK (code ~ '^BU-[0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_units_code_active
  ON platform.business_units (code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_units_org_unit_code_active
  ON platform.business_units (organization_id, unit_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_business_units_org
  ON platform.business_units (organization_id)
  WHERE deleted_at IS NULL;

-- ── Warehouses ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.warehouses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL,
  organization_id  uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  business_unit_id uuid REFERENCES platform.business_units (id) ON DELETE SET NULL,
  name             text NOT NULL,
  wh_code          text NOT NULL,
  address          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT warehouses_code_format CHECK (code ~ '^WH-[0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_code_active
  ON platform.warehouses (code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_org_wh_code_active
  ON platform.warehouses (organization_id, wh_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warehouses_org
  ON platform.warehouses (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warehouses_bu
  ON platform.warehouses (business_unit_id)
  WHERE deleted_at IS NULL AND business_unit_id IS NOT NULL;

-- ── Roles (catalog; permissions seeded in 004) ────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.roles (
  id          smallserial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Users (platform identity; role via memberships only) ────────────────────

CREATE TABLE IF NOT EXISTS platform.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,
  auth_user_id  uuid UNIQUE REFERENCES auth.users (id) ON DELETE SET NULL,
  email         text NOT NULL,
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT users_code_format CHECK (code ~ '^USR-[0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_code_active
  ON platform.users (code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_active
  ON platform.users (lower(email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_auth_user
  ON platform.users (auth_user_id)
  WHERE deleted_at IS NULL AND auth_user_id IS NOT NULL;

-- ── Memberships ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.memberships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL,
  user_id          uuid NOT NULL REFERENCES platform.users (id) ON DELETE RESTRICT,
  organization_id  uuid NOT NULL REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  business_unit_id uuid REFERENCES platform.business_units (id) ON DELETE SET NULL,
  role_id          smallint NOT NULL REFERENCES platform.roles (id) ON DELETE RESTRICT,
  status           text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_code_format CHECK (code ~ '^MEM-[0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_code
  ON platform.memberships (code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_active_scope
  ON platform.memberships (user_id, organization_id, business_unit_id, role_id)
  NULLS NOT DISTINCT
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_memberships_user
  ON platform.memberships (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_memberships_org
  ON platform.memberships (organization_id)
  WHERE status = 'active';

-- ── Membership ↔ warehouse scope (optional) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.membership_warehouses (
  membership_id uuid NOT NULL REFERENCES platform.memberships (id) ON DELETE CASCADE,
  warehouse_id  uuid NOT NULL REFERENCES platform.warehouses (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, warehouse_id)
);

-- ── updated_at triggers ───────────────────────────────────────────────────────

CREATE TRIGGER set_platform_tenants_updated_at
  BEFORE UPDATE ON platform.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_platform_organizations_updated_at
  BEFORE UPDATE ON platform.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_platform_business_units_updated_at
  BEFORE UPDATE ON platform.business_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_platform_warehouses_updated_at
  BEFORE UPDATE ON platform.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_platform_users_updated_at
  BEFORE UPDATE ON platform.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_platform_memberships_updated_at
  BEFORE UPDATE ON platform.memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Grants (RLS applied in 003) ───────────────────────────────────────────────

GRANT USAGE ON SCHEMA platform TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA platform TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform.next_canonical_code(text, int) TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA platform
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
