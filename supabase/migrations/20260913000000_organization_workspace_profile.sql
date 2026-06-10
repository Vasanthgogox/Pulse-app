-- Workspace company profile fields (Network Details tab — Metronic CRUD).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS profile_about text,
  ADD COLUMN IF NOT EXISTS profile_website text,
  ADD COLUMN IF NOT EXISTS profile_ceo_name text,
  ADD COLUMN IF NOT EXISTS profile_sector text,
  ADD COLUMN IF NOT EXISTS profile_area text,
  ADD COLUMN IF NOT EXISTS founded_year int,
  ADD COLUMN IF NOT EXISTS profile_facebook text,
  ADD COLUMN IF NOT EXISTS profile_youtube text,
  ADD COLUMN IF NOT EXISTS profile_products text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.organizations.profile_about IS 'Company about blurb for workspace network profile.';
COMMENT ON COLUMN public.organizations.profile_products IS 'Product / capability tags shown on workspace Details tab.';
