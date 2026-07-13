-- Platform Identity — RLS policies, helper functions, supplementary indexes

-- ── Helper functions (SECURITY INVOKER — RLS applies to underlying queries) ───

CREATE OR REPLACE FUNCTION platform.current_platform_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = platform, public, pg_catalog
AS $$
  SELECT u.id
  FROM platform.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION platform.is_member_of(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = platform, public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.memberships m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = platform.current_platform_user_id()
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION platform.has_org_role(p_organization_id uuid, p_role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = platform, public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.memberships m
    JOIN platform.roles r ON r.id = m.role_id
    WHERE m.organization_id = p_organization_id
      AND m.user_id = platform.current_platform_user_id()
      AND m.status = 'active'
      AND r.code = p_role_code
  );
$$;

CREATE OR REPLACE FUNCTION platform.is_org_admin(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = platform, public, pg_catalog
AS $$
  SELECT platform.has_org_role(p_organization_id, 'admin');
$$;

GRANT EXECUTE ON FUNCTION platform.current_platform_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform.is_member_of(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform.has_org_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform.is_org_admin(uuid) TO authenticated, service_role;

-- ── Enable RLS ──────────────────────────────────────────────────────────────

ALTER TABLE platform.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.membership_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.invite_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.entity_counters ENABLE ROW LEVEL SECURITY;

-- entity_counters: service_role only (Identity Service issues codes)
CREATE POLICY entity_counters_service_role
  ON platform.entity_counters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- roles: readable by all authenticated users
CREATE POLICY roles_select_authenticated
  ON platform.roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY roles_service_role
  ON platform.roles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- tenants: members of any org in tenant may read
CREATE POLICY tenants_select_member
  ON platform.tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM platform.organizations o
      JOIN platform.memberships m ON m.organization_id = o.id
      WHERE o.tenant_id = tenants.id
        AND m.user_id = platform.current_platform_user_id()
        AND m.status = 'active'
        AND o.deleted_at IS NULL
        AND tenants.deleted_at IS NULL
    )
  );

CREATE POLICY tenants_service_role
  ON platform.tenants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- organizations
CREATE POLICY organizations_select_member
  ON platform.organizations
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND platform.is_member_of(id)
  );

CREATE POLICY organizations_insert_authenticated
  ON platform.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (deleted_at IS NULL);

CREATE POLICY organizations_update_admin
  ON platform.organizations
  FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND platform.is_org_admin(id))
  WITH CHECK (deleted_at IS NULL AND platform.is_org_admin(id));

CREATE POLICY organizations_service_role
  ON platform.organizations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- business_units
CREATE POLICY business_units_select_member
  ON platform.business_units
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL AND platform.is_member_of(organization_id));

CREATE POLICY business_units_insert_admin
  ON platform.business_units
  FOR INSERT
  TO authenticated
  WITH CHECK (platform.is_org_admin(organization_id));

CREATE POLICY business_units_update_admin
  ON platform.business_units
  FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND platform.is_org_admin(organization_id))
  WITH CHECK (platform.is_org_admin(organization_id));

CREATE POLICY business_units_service_role
  ON platform.business_units
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- warehouses
CREATE POLICY warehouses_select_member
  ON platform.warehouses
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL AND platform.is_member_of(organization_id));

CREATE POLICY warehouses_insert_admin
  ON platform.warehouses
  FOR INSERT
  TO authenticated
  WITH CHECK (platform.is_org_admin(organization_id));

CREATE POLICY warehouses_update_admin
  ON platform.warehouses
  FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND platform.is_org_admin(organization_id))
  WITH CHECK (platform.is_org_admin(organization_id));

CREATE POLICY warehouses_service_role
  ON platform.warehouses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- users: self + org co-members (admin sees invitees via invitations)
CREATE POLICY users_select_self
  ON platform.users
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      id = platform.current_platform_user_id()
      OR EXISTS (
        SELECT 1
        FROM platform.memberships m1
        JOIN platform.memberships m2 ON m2.organization_id = m1.organization_id
        WHERE m1.user_id = platform.current_platform_user_id()
          AND m2.user_id = users.id
          AND m1.status = 'active'
          AND m2.status = 'active'
      )
    )
  );

CREATE POLICY users_update_self
  ON platform.users
  FOR UPDATE
  TO authenticated
  USING (id = platform.current_platform_user_id() AND deleted_at IS NULL)
  WITH CHECK (id = platform.current_platform_user_id());

CREATE POLICY users_insert_authenticated
  ON platform.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

CREATE POLICY users_service_role
  ON platform.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- memberships
CREATE POLICY memberships_select_scope
  ON platform.memberships
  FOR SELECT
  TO authenticated
  USING (
    user_id = platform.current_platform_user_id()
    OR platform.is_org_admin(organization_id)
  );

CREATE POLICY memberships_insert_admin
  ON platform.memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (platform.is_org_admin(organization_id));

CREATE POLICY memberships_update_admin
  ON platform.memberships
  FOR UPDATE
  TO authenticated
  USING (platform.is_org_admin(organization_id))
  WITH CHECK (platform.is_org_admin(organization_id));

CREATE POLICY memberships_service_role
  ON platform.memberships
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- membership_warehouses
CREATE POLICY membership_warehouses_select
  ON platform.membership_warehouses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform.memberships m
      WHERE m.id = membership_warehouses.membership_id
        AND (
          m.user_id = platform.current_platform_user_id()
          OR platform.is_org_admin(m.organization_id)
        )
    )
  );

CREATE POLICY membership_warehouses_mutate_admin
  ON platform.membership_warehouses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform.memberships m
      WHERE m.id = membership_warehouses.membership_id
        AND platform.is_org_admin(m.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform.memberships m
      WHERE m.id = membership_warehouses.membership_id
        AND platform.is_org_admin(m.organization_id)
    )
  );

CREATE POLICY membership_warehouses_service_role
  ON platform.membership_warehouses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- invitations
CREATE POLICY invitations_select_admin
  ON platform.invitations
  FOR SELECT
  TO authenticated
  USING (platform.is_org_admin(organization_id));

CREATE POLICY invitations_insert_admin
  ON platform.invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (platform.is_org_admin(organization_id));

CREATE POLICY invitations_update_admin
  ON platform.invitations
  FOR UPDATE
  TO authenticated
  USING (platform.is_org_admin(organization_id))
  WITH CHECK (platform.is_org_admin(organization_id));

CREATE POLICY invitations_service_role
  ON platform.invitations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- invite_tokens: service role only (token validation in Identity Service)
CREATE POLICY invite_tokens_service_role
  ON platform.invite_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Supplementary indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_memberships_role
  ON platform.memberships (role_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_membership_warehouses_warehouse
  ON platform.membership_warehouses (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_invitations_invited_by
  ON platform.invitations (invited_by_user_id)
  WHERE invited_by_user_id IS NOT NULL;
