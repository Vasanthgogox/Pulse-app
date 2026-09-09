-- Migration: trip_documents_ground_ops_insert_gate.sql
-- Purpose: split the FOR ALL org-member policy into per-command policies so the
-- Ground Ops org-level toggle can gate INSERT specifically, at the RLS layer
-- (not just app-side), while leaving SELECT/UPDATE/DELETE behavior for every
-- other existing role byte-for-byte unchanged.

BEGIN;

DROP POLICY IF EXISTS "trip_documents_org_member_manage" ON public.trip_documents;

-- SELECT: identical predicate to the old FOR ALL policy. No behavior change.
CREATE POLICY "trip_documents_org_member_select" ON public.trip_documents
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  )
);

-- INSERT: same base predicate, PLUS the Ground-Ops-toggle gate.
-- Non-Ground-Ops members: unaffected (first OR branch always true for them).
-- Ground Ops members: allowed only when the org has explicitly enabled it.
CREATE POLICY "trip_documents_org_member_insert" ON public.trip_documents
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND (
        COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
        OR COALESCE((o.settings ->> 'groundOpsDocUploadEnabled')::boolean, false) IS TRUE
      )
  )
);

-- UPDATE + DELETE: identical base predicate to the old FOR ALL policy,
-- PLUS an explicit exclusion of Ground-Ops-only members (they never get
-- mutate/delete authority regardless of the toggle).
-- Every other role's behavior is byte-for-byte unchanged.
CREATE POLICY "trip_documents_org_member_update" ON public.trip_documents
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
  )
);

CREATE POLICY "trip_documents_org_member_delete" ON public.trip_documents
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
  )
);

COMMIT;
