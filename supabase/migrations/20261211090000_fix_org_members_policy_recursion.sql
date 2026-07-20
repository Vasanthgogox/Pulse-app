-- Fix: "infinite recursion detected in policy for relation organization_members".
--
-- The org_members_update policy added in 20261210120000 (ownership-transfer RLS
-- hardening), and the pre-existing org_members_insert policy, both reference
-- `organization_members` inside a subquery of a policy ON organization_members.
-- Postgres re-applies the table's RLS while evaluating that subquery → infinite
-- recursion, so EVERY UPDATE/INSERT on the table 500s (role change, member
-- removal, and the ownership-transfer writes themselves).
--
-- Fix: move the self-referencing checks into SECURITY DEFINER helpers (which
-- bypass RLS, exactly like the existing is_org_member / is_org_admin used by the
-- SELECT policy). Authorization intent is unchanged:
--   * update/insert allowed for the row owner (self) or an active owner/admin;
--   * writing role='owner' still allowed only for the current active owner
--     (ownership transfer flips it via the SECURITY DEFINER RPC, unaffected).

-- Owner-only helper (mirrors is_org_admin, but role = 'owner' only).
create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
  );
$$;

revoke all on function public.is_org_owner(uuid) from public;
grant execute on function public.is_org_owner(uuid) to authenticated;

-- ── UPDATE policy — no self-reference ────────────────────────────────────────
drop policy if exists org_members_update on public.organization_members;
create policy org_members_update on public.organization_members
  for update
  using (
    user_id = (select auth.uid())
    or public.is_org_admin(organization_id)
  )
  with check (
    (
      user_id = (select auth.uid())
      or public.is_org_admin(organization_id)
    )
    and (
      role <> 'owner'
      or public.is_org_owner(organization_id)
    )
  );

-- ── INSERT policy — no self-reference ────────────────────────────────────────
-- Original allowed: (self-row AND caller owns the org via organizations.owner_id)
-- OR (caller is an active owner/admin of the org). organizations is a different
-- table, so that half is safe; only the organization_members half recursed.
drop policy if exists org_members_insert on public.organization_members;
create policy org_members_insert on public.organization_members
  for insert
  with check (
    (
      user_id = (select auth.uid())
      and exists (
        select 1 from public.organizations
        where organizations.id = organization_members.organization_id
          and organizations.owner_id = (select auth.uid())
      )
    )
    or public.is_org_admin(organization_id)
  );
