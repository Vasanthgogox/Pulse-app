-- PERF FIX: PERF-1 (SEC-9 already exists — unique constraint confirmed present)
-- Replace bare auth.uid() with (SELECT auth.uid()) in high-traffic RLS policies
-- on trip_conversations, trip_messages, ratings, driver_locations.
-- This makes auth.uid() an initplan (evaluated once) instead of per-row.

-- ── driver_locations ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Drivers read own locations" ON driver_locations;
DROP POLICY IF EXISTS "Drivers read own locations" ON driver_locations;
CREATE POLICY "Drivers read own locations" ON driver_locations
FOR SELECT TO public
USING (
  driver_id IN (
    SELECT drivers.id FROM public.drivers
    WHERE drivers.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Drivers insert own location" ON driver_locations;
DROP POLICY IF EXISTS "Drivers insert own location" ON driver_locations;
CREATE POLICY "Drivers insert own location" ON driver_locations
FOR INSERT TO public
WITH CHECK (
  driver_id IN (
    SELECT drivers.id FROM public.drivers
    WHERE drivers.user_id = (SELECT auth.uid())
  )
);

-- ── ratings ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ratings_select_when_rated_driver_is_self" ON ratings;
DROP POLICY IF EXISTS "ratings_select_when_rated_driver_is_self" ON ratings;
CREATE POLICY "ratings_select_when_rated_driver_is_self" ON ratings
FOR SELECT TO authenticated
USING (
  rated_type = 'driver'
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = ratings.rated_id
      AND d.user_id = (SELECT auth.uid())
  )
);

-- ── trip_messages: replace bare auth.uid() in key policies ────────────────
DROP POLICY IF EXISTS "Drivers can view messages in their conversations" ON trip_messages;
DROP POLICY IF EXISTS "Drivers can view messages in their conversations" ON trip_messages;
CREATE POLICY "Drivers can view messages in their conversations" ON trip_messages
FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT tc.id FROM public.trip_conversations tc
    JOIN public.drivers d ON d.id = tc.driver_id
    WHERE d.user_id = (SELECT auth.uid())
  )
  OR organization_id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Drivers can send messages in their conversations" ON trip_messages;
DROP POLICY IF EXISTS "Drivers can send messages in their conversations" ON trip_messages;
CREATE POLICY "Drivers can send messages in their conversations" ON trip_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_role = 'driver'
  AND (
    conversation_id IN (
      SELECT tc.id FROM public.trip_conversations tc
      JOIN public.drivers d ON d.id = tc.driver_id
      WHERE d.user_id = (SELECT auth.uid())
    )
    OR organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
  )
);
