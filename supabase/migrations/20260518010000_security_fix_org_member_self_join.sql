-- SECURITY FIX: CRITICAL-1
-- Tighten organization_members INSERT policy and restrict posts to authenticated.
-- UNIQUE (organization_id, user_id) already exists on the table.

-- 1. Drop the permissive self-join policy
DROP POLICY IF EXISTS "Users can add own membership" ON organization_members;

-- 2. Replacement: only org owners may self-insert (all other additions go through
--    SECURITY DEFINER RPCs which bypass RLS, e.g. accept_driver_invite).
DROP POLICY IF EXISTS "organization_members_owner_self_join" ON organization_members;
CREATE POLICY "organization_members_owner_self_join" ON organization_members
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = organization_members.organization_id
      AND o.owner_id = (SELECT auth.uid())
  )
);

-- 3. Add role CHECK constraint (status constraint already exists)
ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS chk_org_members_role;
ALTER TABLE organization_members
  ADD CONSTRAINT chk_org_members_role
  CHECK (role IN ('owner', 'admin', 'member', 'dispatcher', 'finance'));

-- 4. Restrict posts SELECT to authenticated only (was {public} with no auth check)
DROP POLICY IF EXISTS "posts_select" ON posts;
DROP POLICY IF EXISTS "posts_select_authenticated" ON posts;
CREATE POLICY "posts_select_authenticated" ON posts
FOR SELECT TO authenticated
USING (is_active = true);

-- 5. Revoke anon SELECT on posts so the Data API doesn't serve it unauthenticated
REVOKE SELECT ON posts FROM anon;
