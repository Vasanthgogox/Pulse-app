-- Seed for local development. Run after migrations (e.g. via `npx supabase db reset`).
-- Creates one organization; add your user to it via Studio (Auth > Users for id, then Table Editor > organization_members).

INSERT INTO public.organizations (id, name, slug, updated_at)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
  'Demo Organization',
  'demo',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- To link your user to this org after sign-up, in Studio run (replace YOUR_USER_ID with auth.users.id):
-- INSERT INTO public.organization_members (organization_id, user_id, role, status)
-- VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, 'YOUR_USER_ID'::uuid, 'owner', 'active')
-- ON CONFLICT (organization_id, user_id) DO NOTHING;
