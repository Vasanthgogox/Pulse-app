-- Platform Identity — system roles and default permissions (Phase 1A)

INSERT INTO platform.roles (code, name, permissions, is_system)
VALUES
  (
    'admin',
    'Administrator',
    '["org:read","org:write","users:invite","users:manage","warehouses:write","commerce:*","planning:*","ops:*"]'::jsonb,
    true
  ),
  (
    'planner',
    'Planner',
    '["org:read","warehouses:read","commerce:*","planning:*"]'::jsonb,
    true
  ),
  (
    'operator',
    'Operator',
    '["org:read","warehouses:read","ops:*","execution:read"]'::jsonb,
    true
  )
ON CONFLICT (code) DO UPDATE
SET
  name        = EXCLUDED.name,
  permissions = EXCLUDED.permissions,
  is_system   = EXCLUDED.is_system;

COMMENT ON TABLE platform.roles IS
  'Phase 1A coarse roles. Permissions are capability hints — Gateway enforces; fine-grained RBAC deferred.';

COMMENT ON TABLE platform.memberships IS
  'Role and org scope live here — not on platform.users. JWT membershipId references memberships.code.';
