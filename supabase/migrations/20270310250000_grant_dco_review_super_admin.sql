-- DCO-4 UI-enablement gap: 20270310210000 inserted the 'dco.review'
-- permission key into platform_permissions, but (unlike driver_kyc.review,
-- see 20260903062910_kyc_admin_session_access.sql) never granted it to any
-- platform role. As a result no admin today can call
-- platform_approve_dco/reject/suspend/reinstate, or dco_reopen_rejected --
-- can_review_dco() returns false for every real admin session. Same
-- one-line pattern as the driver_kyc precedent.

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'super_admin'
  AND p.key = 'dco.review'
ON CONFLICT DO NOTHING;
