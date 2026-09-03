-- KYC Phase 3 — let the Admin Console's KYC panel run on the signed-in admin's
-- session instead of the service_role key.
--
-- Audit findings this addresses (everything else was already correct):
--
--   * driver_kyc_documents / driver_kyc_submissions already grant read to
--     has_platform_permission(..., 'driver_kyc.review'), and the
--     driver_kyc_review_queue view is security_invoker=true, so it inherits
--     those policies. Nothing to change there -- a reviewer already sees the
--     queue, a driver still sees only their own rows.
--   * All four KYC RPCs are already SECURITY DEFINER, already guard on
--     can_review_driver_kyc(), and already derive the actor from auth.uid().
--     No caller-supplied admin id exists anywhere in the KYC path.
--
-- The four genuine gaps:
--
--   1. 'driver_kyc.review' is wired to control_tower but NOT super_admin -- the
--      IAM cross-join in 20261224000000 ran before this key existed. A
--      super_admin currently cannot review driver KYC at all.
--   2. profiles is readable only by its owner, so the console cannot resolve a
--      driver's name/phone for the queue.
--   3. organization_kyc_documents is readable only by org members, so the org
--      KYC document list comes back empty for an admin.
--   4. Neither storage bucket has an admin read path, so every signed-URL
--      request for a document would 404 once off service_role.
--
-- Every policy below is additive and permissive: PostgreSQL ORs permissive
-- policies together, so existing driver/org-member access is untouched and these
-- only widen access for holders of driver_kyc.review.

-- ── 1. Grant the existing permission to super_admin ──────────────────────────
insert into public.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from public.platform_roles r, public.platform_permissions p
where r.name = 'super_admin'
  and p.key = 'driver_kyc.review'
on conflict do nothing;

-- ── 2. Reviewer reads driver profiles ────────────────────────────────────────
-- Deliberately NOT "reviewers can read all profiles". The console needs a
-- driver's name/phone only for people who actually have a KYC record, so the
-- policy is scoped by an EXISTS against those two tables. A reviewer gains no
-- visibility into the profile of anyone who never submitted KYC.
drop policy if exists profiles_driver_kyc_reviewer_select on public.profiles;
create policy profiles_driver_kyc_reviewer_select on public.profiles
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'driver_kyc.review')
    and (
      exists (
        select 1 from public.driver_kyc_submissions s
        where s.driver_user_id = profiles.id
      )
      or exists (
        select 1 from public.driver_kyc_documents d
        where d.driver_user_id = profiles.id
      )
    )
  );

-- ── 3. Reviewer reads organization KYC documents ─────────────────────────────
-- The org-KYC document list in the console. Read-only: approving/rejecting org
-- KYC continues to go through admin_approve_profile/admin_reject_profile, which
-- are SECURITY DEFINER and carry their own verification.approve guard -- this
-- policy deliberately does not grant UPDATE.
--
-- Gated on verification.review (the org-KYC permission), not driver_kyc.review:
-- they are different jobs and the existing IAM already separates them.
drop policy if exists org_kyc_documents_platform_select on public.organization_kyc_documents;
create policy org_kyc_documents_platform_select on public.organization_kyc_documents
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
  );

-- ── 4. Reviewer reads document bytes (Storage RLS) ───────────────────────────
-- Both buckets are private and scoped to the uploader (driver-documents) or org
-- members (verification-documents). service_role bypassed that; a session does
-- not. Read-only, and each is limited to its own bucket.
drop policy if exists "KYC reviewers read driver documents" on storage.objects;
create policy "KYC reviewers read driver documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'driver-documents'
  and public.has_platform_permission((select auth.uid()), 'driver_kyc.review')
);

drop policy if exists "Verification reviewers read org documents" on storage.objects;
create policy "Verification reviewers read org documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
  )
);

-- ── 5. Close anon on the guard helper ────────────────────────────────────────
-- can_review_driver_kyc() is a boolean predicate, but anon has no business
-- calling it, and the four RPCs it guards already had anon revoked in
-- 20270306030000. This closes the last anon-reachable KYC entry point.
revoke execute on function public.can_review_driver_kyc() from public, anon;
grant execute on function public.can_review_driver_kyc() to authenticated, service_role;
