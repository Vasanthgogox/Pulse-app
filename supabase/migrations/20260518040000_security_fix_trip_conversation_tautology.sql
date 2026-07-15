-- SECURITY FIX: CRITICAL-4
-- trip_conversations driver INSERT/UPDATE policies had tautological self-comparisons
-- (t.driver_id = t.driver_id) that allowed any driver to insert convos for any trip.

DROP POLICY IF EXISTS "drivers_insert_own_driver_trip_conversation" ON trip_conversations;
CREATE POLICY "drivers_insert_own_driver_trip_conversation" ON trip_conversations
FOR INSERT TO authenticated
WITH CHECK (
  party_type = 'driver'
  AND driver_id IN (
    SELECT d.id FROM drivers d
    WHERE d.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM trips t
    WHERE t.id = trip_conversations.trip_id
      AND t.driver_id = trip_conversations.driver_id  -- correct cross-reference
  )
);

DROP POLICY IF EXISTS "drivers_update_own_driver_trip_conversation" ON trip_conversations;
CREATE POLICY "drivers_update_own_driver_trip_conversation" ON trip_conversations
FOR UPDATE TO authenticated
USING (
  party_type = 'driver'
  AND driver_id IN (
    SELECT d.id FROM drivers d
    WHERE d.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  party_type = 'driver'
  AND driver_id IN (
    SELECT d.id FROM drivers d
    WHERE d.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM trips t
    WHERE t.id = trip_conversations.trip_id
      AND t.driver_id = trip_conversations.driver_id
  )
);
