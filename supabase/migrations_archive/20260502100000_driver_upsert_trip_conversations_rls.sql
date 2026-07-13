-- Driver app calls getOrCreateConversation (trip_conversations upsert). Fleet drivers are usually
-- not organization_members on the owning org, so the existing "members can manage" policy denies
-- INSERT/UPDATE. Grants insert/update only for party_type='driver' rows tied to trips they are assigned to.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_conversations'
      AND policyname = 'drivers_insert_own_driver_trip_conversation'
  ) THEN
    CREATE POLICY "drivers_insert_own_driver_trip_conversation"
      ON public.trip_conversations
      FOR INSERT
      TO authenticated
      WITH CHECK (
        party_type = 'driver'
        AND driver_id IN (
          SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1
          FROM public.trips t
          WHERE t.id = trip_id
            AND t.driver_id = driver_id
            AND t.organization_id = organization_id
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_conversations'
      AND policyname = 'drivers_update_own_driver_trip_conversation'
  ) THEN
    CREATE POLICY "drivers_update_own_driver_trip_conversation"
      ON public.trip_conversations
      FOR UPDATE
      TO authenticated
      USING (
        party_type = 'driver'
        AND driver_id IN (
          SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid()
        )
      )
      WITH CHECK (
        party_type = 'driver'
        AND driver_id IN (
          SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1
          FROM public.trips t
          WHERE t.id = trip_id
            AND t.driver_id = driver_id
            AND t.organization_id = organization_id
        )
      );
  END IF;
END $$;