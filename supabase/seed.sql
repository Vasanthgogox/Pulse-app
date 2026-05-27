-- Seed for local development. Run after migrations (e.g. via `npx supabase db reset`).
-- Creates one organization; add your user to it via Studio (Auth > Users for id, then Table Editor > organization_members).

INSERT INTO public.organizations (id, name, slug, owner_id, updated_at)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
  'Demo Organization',
  'demo',
  NULL,
  now()
)
ON CONFLICT (id) DO NOTHING;

-- To link your user to this org after sign-up, in Studio run (replace YOUR_USER_ID with auth.users.id):
-- UPDATE public.organizations SET owner_id = 'YOUR_USER_ID'::uuid WHERE id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid;
-- INSERT INTO public.organization_members (organization_id, user_id, role, status)
-- VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, 'YOUR_USER_ID'::uuid, 'owner', 'active')
-- ON CONFLICT (organization_id, user_id) DO NOTHING;
