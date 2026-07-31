-- Close a self-requeue hole in driver KYC, and tighten policy roles.
--
-- Found by attempting the attack: the UPDATE policy on driver_kyc_submissions
-- granted a driver blanket write access to their own row, so an already-
-- APPROVED driver could run
--
--   update driver_kyc_submissions set review_status='submitted', attempt_count=99
--
-- straight from the client and put themselves back in the review queue,
-- bypassing driver_submit_kyc_for_verification() and every completeness check
-- it enforces (mandatory docs present, no rejected mandatory docs, approved is
-- terminal). The with_check clause required review_status='submitted', which
-- was exactly the value an attacker wanted to write — so it blocked nothing.
--
-- Confirmed NOT possible (verified by attempting each, all blocked): a driver
-- marking their own document 'verified', inserting a pre-verified document,
-- creating a submission for a different driver, withdrawing a mandatory
-- document, or an ordinary authenticated user reviewing KYC.
--
-- Fix: drop the driver UPDATE policy entirely. Every legitimate state change
-- already goes through a SECURITY DEFINER function
-- (driver_submit_kyc_for_verification / platform_review_driver_kyc_submission),
-- which owns the row and does not consult RLS — the same posture
-- driver_kyc_documents already uses, where the deliberate absence of an UPDATE
-- policy is what stops a driver self-verifying.

-- ── 1. Remove the writable path ─────────────────────────────────────────────
drop policy if exists driver_kyc_submissions_update on public.driver_kyc_submissions;

-- ── 2. Scope policies to authenticated, not public ──────────────────────────
-- These were created without an explicit TO clause, so they defaulted to
-- role `public` (which includes anon). RLS still gated them via auth.uid(),
-- but anon has no business evaluating these predicates at all.
drop policy if exists driver_kyc_submissions_select on public.driver_kyc_submissions;
create policy driver_kyc_submissions_select
  on public.driver_kyc_submissions for select
  to authenticated
  using (
    driver_user_id = (select auth.uid())
    or public.has_platform_permission((select auth.uid()), 'driver_kyc.review')
  );

drop policy if exists driver_kyc_submissions_insert on public.driver_kyc_submissions;
create policy driver_kyc_submissions_insert
  on public.driver_kyc_submissions for insert
  to authenticated
  with check (driver_user_id = (select auth.uid()));

drop policy if exists driver_kyc_submission_events_select on public.driver_kyc_submission_events;
create policy driver_kyc_submission_events_select
  on public.driver_kyc_submission_events for select
  to authenticated
  using (
    driver_user_id = (select auth.uid())
    or public.has_platform_permission((select auth.uid()), 'driver_kyc.review')
  );

-- The requirement list is reference data the driver app needs to render its
-- checklist; keep it readable pre-auth but say so explicitly.
drop policy if exists driver_kyc_doc_requirements_select on public.driver_kyc_doc_requirements;
create policy driver_kyc_doc_requirements_select
  on public.driver_kyc_doc_requirements for select
  to authenticated, anon
  using (true);

-- ── 3. Verification status for downstream surfaces ──────────────────────────
-- The driver profile screen derived KYC state from auth user_metadata and
-- storage filename guesses (pre-dating driver_kyc_documents), so it could not
-- show verification at all and drifted from the real rows. This gives every
-- consumer one authoritative read.
create or replace view public.driver_kyc_status
with (security_invoker = true)
as
select
  s.driver_user_id,
  s.review_status,
  s.submitted_at,
  s.reviewed_at,
  s.review_notes,
  s.attempt_count,
  (s.review_status = 'approved')                    as is_verified,
  count(k.id) filter (where k.status = 'verified')  as verified_docs,
  count(k.id)                                      as uploaded_docs,
  (select count(*) from public.driver_kyc_doc_requirements r where r.is_mandatory)
                                                    as required_docs
from public.driver_kyc_submissions s
left join public.driver_kyc_documents k
       on k.driver_user_id = s.driver_user_id
      and k.deleted_at is null
group by s.driver_user_id, s.review_status, s.submitted_at, s.reviewed_at,
         s.review_notes, s.attempt_count;

grant select on public.driver_kyc_status to authenticated;
