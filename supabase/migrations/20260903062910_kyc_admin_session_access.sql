insert into public.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from public.platform_roles r, public.platform_permissions p
where r.name = 'super_admin'
  and p.key = 'driver_kyc.review'
on conflict do nothing;

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

drop policy if exists org_kyc_documents_platform_select on public.organization_kyc_documents;
create policy org_kyc_documents_platform_select on public.organization_kyc_documents
  for select
  to authenticated
  using (
    public.has_platform_permission((select auth.uid()), 'verification.review')
    or public.has_platform_permission((select auth.uid()), 'verification.approve')
  );

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

revoke execute on function public.can_review_driver_kyc() from public, anon;
grant execute on function public.can_review_driver_kyc() to authenticated, service_role;