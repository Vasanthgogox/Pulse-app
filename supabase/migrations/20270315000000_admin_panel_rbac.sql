-- ============================================================
-- Admin Panel RBAC Enhancement — Production-Grade Permission Enforcement
-- ============================================================
-- Adds granular permissions for all admin panel features: verification,
-- driver KYC, credits, feature flags, support, marketplace fees.
-- Defines role presets: Super Admin, Verification Manager, KYC Operator,
-- Support Agent, Financial Auditor. Admin users are created/managed via
-- the Admin Users Management tab using invite_platform_admin().

-- ── 1. Define new permission keys ──────────────────────────────────

INSERT INTO public.platform_permissions (key, description) VALUES
  ('verification.review',        'View and triage pending organization verifications'),
  ('verification.approve',       'Approve, reject, or escalate organization verification'),
  ('driver.kyc.review',          'View and triage pending driver KYC submissions'),
  ('driver.kyc.approve',         'Approve, reject driver KYC submissions'),
  ('credits.manage',             'Issue, reverse, and audit organization credits'),
  ('support.manage',             'Triage and respond to support tickets'),
  ('system.flags.manage',        'Toggle feature flags across organizations'),
  ('users.suspend',              'Suspend and unsuspend user accounts'),
  ('marketplace_fees.manage',    'Adjust marketplace fee rules and rates'),
  ('reach.manage',               'Manage Reach campaigns, audiences, stories'),
  ('reach.approve',              'Approve Reach campaigns for publishing'),
  ('analytics.view',             'View internal analytics dashboards')
ON CONFLICT (key) DO NOTHING;

-- ── 2. Define role presets with permission bundles ─────────────────

INSERT INTO public.platform_roles (name, description) VALUES
  ('super_admin',         'Full administrative access to all features'),
  ('verification_mgr',    'Manages organization verification queue'),
  ('kyc_operator',        'Reviews and approves driver KYC submissions'),
  ('support_agent',       'Manages support tickets and escalations'),
  ('financial_auditor',   'Views credits and analytics; issues/reverses credits')
ON CONFLICT (name) DO NOTHING;

-- ── 3. Grant permissions to new roles ──────────────────────────────

-- super_admin: has all permissions (already done in previous migration)
-- verification_mgr: verification queue + analytics
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'verification_mgr'
  AND p.key IN (
    'verification.review', 'verification.approve',
    'analytics.view'
  )
ON CONFLICT DO NOTHING;

-- kyc_operator: driver KYC + analytics
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'kyc_operator'
  AND p.key IN (
    'driver.kyc.review', 'driver.kyc.approve',
    'analytics.view'
  )
ON CONFLICT DO NOTHING;

-- support_agent: support tickets + user suspension + analytics
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'support_agent'
  AND p.key IN (
    'support.manage', 'users.suspend',
    'analytics.view'
  )
ON CONFLICT DO NOTHING;

-- financial_auditor: credits, analytics view (read-heavy)
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'financial_auditor'
  AND p.key IN (
    'credits.manage',
    'analytics.view'
  )
ON CONFLICT DO NOTHING;

-- control_tower role (if it exists): add missing permissions
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'control_tower'
  AND p.key IN (
    'verification.review', 'verification.approve',
    'credits.manage', 'analytics.view'
  )
ON CONFLICT DO NOTHING;

-- ── 4. Add migration column to platform_users for audit ─────────────

ALTER TABLE public.platform_users
ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

ALTER TABLE public.platform_users
ADD COLUMN IF NOT EXISTS last_active_ip text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_platform_users_last_active ON public.platform_users(last_active_at DESC);
