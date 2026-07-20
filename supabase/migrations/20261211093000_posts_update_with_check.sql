-- Fix: "new row violates row-level security policy for table posts" (403) when
-- an org deactivates its own expired stories (getNetworkFeed auto-deactivate).
--
-- Root cause: posts_select_authenticated only exposes rows WHERE is_active=true.
-- The auto-deactivate flips is_active true→false; PostgREST issues
-- UPDATE ... RETURNING, so it must read the new row back — but the new row
-- (is_active=false) no longer satisfies the SELECT policy, so the read-back is
-- blocked and the whole statement is rejected with a 403.
--
-- Fix: let an org SELECT its OWN posts regardless of is_active (so the read-back
-- after deactivation succeeds), while everyone else still only sees active posts.
-- posts_update keeps its org-membership USING; we add a matching WITH CHECK so an
-- org still can only update its own posts.

-- ── SELECT: active posts (anyone) OR own-org posts (any is_active) ───────────
drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated on public.posts
  for select
  using (
    is_active = true
    or organization_id in (
      select organization_members.organization_id
      from organization_members
      where organization_members.user_id = (select auth.uid())
    )
  );

-- ── UPDATE: explicit WITH CHECK mirroring USING (own-org only) ───────────────
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts
  for update
  using (
    organization_id in (
      select organization_members.organization_id
      from organization_members
      where organization_members.user_id = (select auth.uid())
    )
  )
  with check (
    organization_id in (
      select organization_members.organization_id
      from organization_members
      where organization_members.user_id = (select auth.uid())
    )
  );
