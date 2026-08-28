-- Fix the "sales" platform-role preset's missing tripops.tab surface, both
-- going forward (source fix lives in lib/memberSurfaces.ts, TypeScript, not
-- DB) and for already-affected members (this one-time backfill).
--
-- ROOT CAUSE (GOGOVAN / daisy.b@gogox.com "Add Load button missing" report):
--   defaultSurfacesForRole("sales", orgCaps) in lib/memberSurfaces.ts filtered
--   MEMBER_SURFACE_CATALOG by domain==="sales" only. tripops.indents.* and
--   tripops.pulse_loads are catalogued under domain:"sales" (give-load lives
--   in the Network tab), but their requires-chain root, tripops.tab, is
--   domain:"tripops" — excluded by that filter. Any member set up via the
--   "sales" preset therefore got tripops.indents.create/view=true stored,
--   with tripops.tab never written at all (not even false — absent).
--
--   memberHasSurface() walks the requires chain recursively
--   (tripops.indents.create -> tripops.indents.view -> tripops.tab) and
--   returns false the moment any link is missing/falsy — so the "Add Load"
--   button (features/network/components/LoadCenterView.tsx, gated on
--   canSurface("tripops.indents.create")) silently never rendered, with
--   every other surface in her stored permissions correctly reading true.
--
--   The identical class of bug was already caught and fixed for the
--   "tripops" and "planner" presets (see docs/RBAC_OPERATING_MODEL_CHANGELOG.md
--   TC-13) but never back-ported to "sales" until this fix.
--
-- FIX:
--   1. lib/memberSurfaces.ts: "sales" case in defaultSurfacesForRole now also
--      includes tripops.indents.*, tripops.tab, and tripops.pulse_loads —
--      mirrors the existing "tripops"/"planner" cases.
--   2. lib/memberSurfaces.ts: new normalizeSurfaces() helper, called before
--      every permissions save in MemberPermissionsPanel and
--      buildTeamInvitePermissions — force-includes each true surface's full
--      requires chain, so this failure class (any of the ~30 requires pairs
--      in the catalog, not just this one) can no longer reach storage via
--      any known write path, even a future preset/bundle mistake.
--   3. This migration: one-time backfill for the 2 existing rows already in
--      this exact broken state (confirmed by direct query — no broader
--      pattern found across any other requires pair in the catalog).
BEGIN;

UPDATE organization_members
SET permissions = jsonb_set(
  permissions,
  '{surfaces,tripops.tab}',
  'true'::jsonb,
  true
)
WHERE (permissions -> 'surfaces' ->> 'tripops.indents.create') = 'true'
  AND (permissions -> 'surfaces' -> 'tripops.tab') IS NULL;

COMMIT;
