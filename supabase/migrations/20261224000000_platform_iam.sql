-- ============================================================
-- Platform IAM — cross-tenant identity/access for internal Pulse staff.
-- ============================================================
-- Not tied to any organization. Backs the new `control-tower/` app (real
-- Supabase Auth login) — distinct from tenant RBAC (organization_members)
-- and distinct from `analytics/`'s service-role-key access (untouched).
-- Consumers: Control Tower verification queue now, Reach admin later,
-- any future cross-tenant module reuses the same permission keys.
-- ============================================================

-- ── 1. Platform users (Pulse internal staff, keyed to auth.users) ────────────

CREATE TABLE IF NOT EXISTS public.platform_users (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  employee_id  text,
  department   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_users_user ON public.platform_users(user_id);

-- ── 2. Roles and permissions (RBAC, not ABAC — keep it simple) ───────────────

CREATE TABLE IF NOT EXISTS public.platform_roles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL UNIQUE,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_permissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text        NOT NULL UNIQUE,  -- e.g. 'verification.review', 'reach.manage'
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_role_permissions (
  role_id        uuid NOT NULL REFERENCES public.platform_roles(id) ON DELETE CASCADE,
  permission_id  uuid NOT NULL REFERENCES public.platform_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.platform_role_members (
  platform_user_id  uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  role_id           uuid NOT NULL REFERENCES public.platform_roles(id) ON DELETE CASCADE,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  granted_by        uuid REFERENCES auth.users(id),
  PRIMARY KEY (platform_user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_role_members_user ON public.platform_role_members(platform_user_id);

-- ── 3. Seed roles + permissions for this delivery's scope only ───────────────
-- (Reach admin + verification review. Additional roles/permissions are added
-- with future modules — see docs/architecture/platform/REACH_GROWTH_PLATFORM_ROADMAP.md.)

INSERT INTO public.platform_roles (name, description) VALUES
  ('super_admin',   'Full platform access across all modules'),
  ('control_tower', 'Verification review and credit adjustments'),
  ('reach_admin',   'Reach campaign, audience, and analytics management')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.platform_permissions (key, description) VALUES
  ('verification.review',  'View and triage pending verification requests'),
  ('verification.approve', 'Approve or reject a verification request'),
  ('credits.issue',        'Manually credit a wallet'),
  ('credits.reverse',      'Manually debit / reverse a wallet transaction'),
  ('reach.manage',         'Create/edit/moderate Reach campaigns and stories'),
  ('reach.approve',        'Approve a Reach campaign for publish'),
  ('analytics.view',       'View Reach and platform analytics dashboards')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'control_tower' AND p.key IN ('verification.review', 'verification.approve', 'credits.issue', 'credits.reverse', 'analytics.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'reach_admin' AND p.key IN ('reach.manage', 'reach.approve', 'analytics.view')
ON CONFLICT DO NOTHING;

-- ── 4. Authorization helper — used in every platform-scoped RLS policy ───────

CREATE OR REPLACE FUNCTION public.has_platform_permission(p_user_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_role_members prm
    JOIN public.platform_users pu ON pu.id = prm.platform_user_id
    JOIN public.platform_role_permissions prp ON prp.role_id = prm.role_id
    JOIN public.platform_permissions pp ON pp.id = prp.permission_id
    WHERE pu.user_id = p_user_id
      AND pu.status = 'active'
      AND pp.key = p_permission
  );
$$;

REVOKE ALL ON FUNCTION public.has_platform_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(uuid, text) TO authenticated;

-- ── 5. Self-service permission lookup — Control Tower's access-gate hook ─────

CREATE OR REPLACE FUNCTION public.get_my_platform_permissions()
RETURNS TABLE (permission_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT pp.key
  FROM public.platform_role_members prm
  JOIN public.platform_users pu ON pu.id = prm.platform_user_id
  JOIN public.platform_role_permissions prp ON prp.role_id = prm.role_id
  JOIN public.platform_permissions pp ON pp.id = prp.permission_id
  WHERE pu.user_id = (select auth.uid())
    AND pu.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.get_my_platform_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_platform_permissions() TO authenticated;

-- ── 6. RLS — no tenant policy exists on these tables; only platform staff ────
-- may read them, and only about themselves unless they hold any platform role
-- (self-service bootstrapping problem: a brand-new platform_user must be able
-- to read their own row to discover they have zero roles yet).

ALTER TABLE public.platform_users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_role_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_role_members      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_users_self_or_staff" ON public.platform_users;
CREATE POLICY "platform_users_self_or_staff" ON public.platform_users
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.platform_role_members WHERE platform_user_id IN (
      SELECT id FROM public.platform_users WHERE user_id = (select auth.uid())
    ))
  );

DROP POLICY IF EXISTS "platform_roles_staff_read" ON public.platform_roles;
CREATE POLICY "platform_roles_staff_read" ON public.platform_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.platform_users pu
      WHERE pu.user_id = (select auth.uid()) AND pu.status = 'active'
    )
  );

DROP POLICY IF EXISTS "platform_permissions_staff_read" ON public.platform_permissions;
CREATE POLICY "platform_permissions_staff_read" ON public.platform_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.platform_users pu
      WHERE pu.user_id = (select auth.uid()) AND pu.status = 'active'
    )
  );

DROP POLICY IF EXISTS "platform_role_permissions_staff_read" ON public.platform_role_permissions;
CREATE POLICY "platform_role_permissions_staff_read" ON public.platform_role_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.platform_users pu
      WHERE pu.user_id = (select auth.uid()) AND pu.status = 'active'
    )
  );

DROP POLICY IF EXISTS "platform_role_members_self_or_staff" ON public.platform_role_members;
CREATE POLICY "platform_role_members_self_or_staff" ON public.platform_role_members
  FOR SELECT USING (
    platform_user_id IN (SELECT id FROM public.platform_users WHERE user_id = (select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.platform_users pu
      WHERE pu.user_id = (select auth.uid()) AND pu.status = 'active'
    )
  );

-- Writes to all five tables are intentionally left to service_role only (no
-- INSERT/UPDATE/DELETE policy = denied for authenticated/anon). Granting new
-- platform roles is an ops action performed via the Supabase dashboard/service
-- key, not a self-service app action, for this delivery.

-- ── 7. Platform event log — append-only, Postgres-native "event bus" ────────

CREATE TABLE IF NOT EXISTS public.platform_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     text        NOT NULL,  -- e.g. 'BusinessVerified', 'ReachPublished', 'CreditsAwarded'
  org_id         uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_user_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  payload        jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_events_created_at ON public.platform_events USING BRIN (created_at);
CREATE INDEX IF NOT EXISTS idx_platform_events_type        ON public.platform_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_org          ON public.platform_events(org_id, created_at DESC);

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_events_staff_read" ON public.platform_events;
CREATE POLICY "platform_events_staff_read" ON public.platform_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.platform_users pu
      WHERE pu.user_id = (select auth.uid()) AND pu.status = 'active'
    )
  );
-- Inserts happen exclusively via SECURITY DEFINER RPCs (emit_platform_event
-- below, and every RPC in later Reach/growth-loop migrations) — no direct
-- INSERT policy for authenticated/anon.

CREATE OR REPLACE FUNCTION public.emit_platform_event(
  p_event_type text,
  p_org_id     uuid DEFAULT NULL,
  p_payload    jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.platform_events (event_type, org_id, actor_user_id, payload)
  VALUES (p_event_type, p_org_id, (select auth.uid()), p_payload)
  RETURNING id;
$$;

REVOKE ALL ON FUNCTION public.emit_platform_event(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_platform_event(text, uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_platform_permission(uuid, text) IS
  'Platform IAM authorization check — used in RLS policies and RPCs for cross-tenant admin actions (Control Tower, future modules). Distinct from tenant RBAC (organization_members roles).';
