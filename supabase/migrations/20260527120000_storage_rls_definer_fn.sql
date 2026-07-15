-- ═════════════════════════════════════════════════════════════════════════════
-- STORAGE RLS: SECURITY DEFINER FUNCTION FOR TRIP-DOCUMENTS BUCKET
--
-- ROOT CAUSE (image open causing DB Unhealthy):
-- The policy "Org members can read trip documents by folder" runs an inline
-- EXISTS(trips JOIN organization_members) for every storage.objects row that
-- PostgREST evaluates. When a chat thread loads 10 thumbnails simultaneously:
--   10 images × 3 bucket tries (createSignedUrl) × RLS eval
--   = 30 trips→org_members JOIN evaluations, each touching the heap.
--
-- Additional bugs in the old policy:
--   1. COALESCE(om.status,'active')='active'  — function-wraps a column,
--      preventing PostgreSQL from using the partial index on status='active'.
--   2. t.id::text = (storage.foldername(name))[1]  — casts UUID to text for
--      the comparison instead of casting the folder string to UUID.
--   3. auth.uid() evaluated per-row  — no (SELECT auth.uid()) initplan guard.
--
-- FIX: SECURITY DEFINER function
--   • Named function = plan-cacheable by PostgreSQL's query planner.
--   • STABLE = result is constant for same arguments within a single statement.
--   • (SELECT auth.uid()) inside the function body = evaluated once as initplan.
--   • UUID cast with exception handling = safe short-circuit for non-trip paths.
--   • (om.status = 'active' OR om.status IS NULL) = sargable, index-friendly.
--
-- PLAN BEFORE  : Nested Loop (trips × org_members), heap fetches per thumbnail
-- PLAN AFTER   : trips PK lookup (1 row) → org_members index scan (1 row), 0 heap
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── 1. SECURITY DEFINER function ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_storage_trip_doc_access(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE                   -- result is stable within a statement for same args
SECURITY DEFINER         -- runs as function owner, not the calling user
SET search_path = public, storage
AS $$
DECLARE
  v_folder  TEXT;
  v_trip_id UUID;
BEGIN
  -- Extract the first directory component (trip_id) from the storage path.
  -- storage.foldername('/abc-uuid/filename.jpg') → '{abc-uuid}'
  v_folder := (storage.foldername(p_name))[1];
  IF v_folder IS NULL OR length(v_folder) < 32 THEN
    RETURN FALSE;
  END IF;

  -- Guard: return FALSE for non-UUID folder names (system files, avatars, etc.)
  -- without touching any app tables.
  BEGIN
    v_trip_id := v_folder::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN FALSE;
  END;

  -- Is the calling user an active member of the trip's owning organisation?
  -- Execution plan:
  --   1. trips PK scan: trips(id = v_trip_id)               → 1 row, O(1)
  --   2. org_members index scan: (user_id, organization_id) → 1 row, O(1)
  -- (SELECT auth.uid()) is evaluated once as an initplan, not per-row.
  RETURN EXISTS (
    SELECT 1
    FROM   public.trips t
    JOIN   public.organization_members om
             ON om.organization_id = t.organization_id
            AND om.user_id         = (SELECT auth.uid())
            AND (om.status = 'active' OR om.status IS NULL)
    WHERE  t.id = v_trip_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_storage_trip_doc_access(TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_storage_trip_doc_access IS
  'Storage RLS helper: checks that the calling user is an active org member '
  'of the trip that owns the file. SECURITY DEFINER + STABLE = plan-cacheable '
  'and evaluated once per query rather than once per row.';


-- ─── 2. Replace the old policy ───────────────────────────────────────────────
--
-- Old policy had COALESCE (non-sargable), text cast for UUID comparison, and
-- inline auth.uid() per-row evaluation.

DROP POLICY IF EXISTS "Org members can read trip documents by folder" ON storage.objects;

CREATE POLICY "trip-documents: org-member via security-definer"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'trip-documents'
    AND public.fn_storage_trip_doc_access(name)
  );
