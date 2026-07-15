-- Fix auth_rls_initplan: wrap auth.uid() in (select ...) so it is evaluated
-- once per query instead of once per row. Affects 68 policies across 25 tables.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- bids
ALTER POLICY bids_insert ON public.bids
  WITH CHECK (
    bidder_organization_id IN (
      SELECT organization_members.organization_id FROM organization_members
      WHERE organization_members.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY bids_select ON public.bids
  USING (
    (bidder_organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = (SELECT auth.uid()) AND om.status = 'active'
    )) OR (EXISTS (
      SELECT 1 FROM posts p
      JOIN organization_members om ON om.organization_id = p.organization_id
        AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
      WHERE p.id = bids.post_id
    ))
  );

ALTER POLICY bids_update ON public.bids
  USING (
    (bidder_organization_id IN (
      SELECT organization_members.organization_id FROM organization_members
      WHERE organization_members.user_id = (SELECT auth.uid())
    )) OR (post_id IN (
      SELECT p.id FROM posts p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = (SELECT auth.uid())
    ))
  );

-- connection_requests
ALTER POLICY "From-org can insert connection_requests" ON public.connection_requests
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = connection_requests.from_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "From-org can manage own connection_requests" ON public.connection_requests
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = connection_requests.from_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = connection_requests.from_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "To-org can read connection_requests to them" ON public.connection_requests
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = connection_requests.to_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "To-org can update connection_requests to them" ON public.connection_requests
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = connection_requests.to_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

-- direct_quotes
ALTER POLICY "Bidders can insert own direct quotes" ON public.direct_quotes
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = direct_quotes.bidder_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Bidders can select own direct quotes" ON public.direct_quotes
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = direct_quotes.bidder_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Bidders can update own direct quotes" ON public.direct_quotes
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = direct_quotes.bidder_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Indent owners can read quotes on their indents" ON public.direct_quotes
  USING (
    EXISTS (
      SELECT 1 FROM indents i
      JOIN organization_members om ON om.organization_id = i.organization_id
        AND om.user_id = (SELECT auth.uid())
      WHERE i.id = direct_quotes.indent_id
    )
  );

ALTER POLICY "Indent owners can update quotes on their indents" ON public.direct_quotes
  USING (
    EXISTS (
      SELECT 1 FROM indents i
      JOIN organization_members om ON om.organization_id = i.organization_id
        AND om.user_id = (SELECT auth.uid())
      WHERE i.id = direct_quotes.indent_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM indents i
      JOIN organization_members om ON om.organization_id = i.organization_id
        AND om.user_id = (SELECT auth.uid())
      WHERE i.id = direct_quotes.indent_id
    )
  );

-- driver_invites
ALTER POLICY "Invitee can read own invites" ON public.driver_invites
  USING (to_user_id = (SELECT auth.uid()));

ALTER POLICY "Invitee can update own pending invite" ON public.driver_invites
  USING ((to_user_id = (SELECT auth.uid())) AND (status = 'pending'))
  WITH CHECK (to_user_id = (SELECT auth.uid()));

-- driver_ledger
ALTER POLICY "Drivers can insert settlement for own ledger" ON public.driver_ledger
  WITH CHECK (
    (type = 'settlement') AND (EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = driver_ledger.driver_id AND d.user_id = (SELECT auth.uid())
    ))
  );

ALTER POLICY "Drivers can read own ledger" ON public.driver_ledger
  USING (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = driver_ledger.driver_id AND d.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Org members can manage driver_ledger" ON public.driver_ledger
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = driver_ledger.organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = driver_ledger.organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

-- driver_locations
ALTER POLICY "Drivers insert own location" ON public.driver_locations
  WITH CHECK (
    driver_id IN (
      SELECT drivers.id FROM drivers
      WHERE drivers.user_id = (SELECT auth.uid())
    )
  );

-- driver_profiles (table created in 20260519120000_schema_refactor_from_master_init.sql)
DO $$
BEGIN
  IF to_regclass('public.driver_profiles') IS NOT NULL THEN
    ALTER POLICY drvprofile_insert_own ON public.driver_profiles
      WITH CHECK (user_id = (SELECT auth.uid()));

    ALTER POLICY drvprofile_org_view ON public.driver_profiles
      USING (
        EXISTS (
          SELECT 1 FROM drivers d
          JOIN organization_members om ON om.organization_id = d.organization_id
          WHERE d.user_id = driver_profiles.user_id
            AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
        )
      );

    ALTER POLICY drvprofile_select_own ON public.driver_profiles
      USING (user_id = (SELECT auth.uid()));

    ALTER POLICY drvprofile_update_own ON public.driver_profiles
      USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

-- driver_salary_requests
ALTER POLICY "Drivers can insert own driver_salary_requests" ON public.driver_salary_requests
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = driver_salary_requests.driver_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Drivers can read own driver_salary_requests" ON public.driver_salary_requests
  USING (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = driver_salary_requests.driver_id
        AND d.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Org members can manage driver_salary_requests" ON public.driver_salary_requests
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = driver_salary_requests.organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = driver_salary_requests.organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

-- drivers
ALTER POLICY "Drivers can read own row" ON public.drivers
  USING (user_id = (SELECT auth.uid()));

-- network_conversations
ALTER POLICY org_members_access_network_conversations ON public.network_conversations
  USING (
    (org_a_id IN (
      SELECT organization_members.organization_id FROM organization_members
      WHERE organization_members.user_id = (SELECT auth.uid())
    )) OR (org_b_id IN (
      SELECT organization_members.organization_id FROM organization_members
      WHERE organization_members.user_id = (SELECT auth.uid())
    ))
  );

-- network_messages
ALTER POLICY org_members_access_network_messages ON public.network_messages
  USING (
    conversation_id IN (
      SELECT network_conversations.id FROM network_conversations
      WHERE
        (network_conversations.org_a_id IN (
          SELECT organization_members.organization_id FROM organization_members
          WHERE organization_members.user_id = (SELECT auth.uid())
        )) OR (network_conversations.org_b_id IN (
          SELECT organization_members.organization_id FROM organization_members
          WHERE organization_members.user_id = (SELECT auth.uid())
        ))
    )
  );

-- organization_counters
ALTER POLICY organization_counters_org_member_manage ON public.organization_counters
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_counters.organization_id
        AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_counters.organization_id
        AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
    )
  );

-- organization_members
ALTER POLICY "Users can add own membership" ON public.organization_members
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY "Users can read own memberships" ON public.organization_members
  USING (user_id = (SELECT auth.uid()));

-- organization_relations
ALTER POLICY "From-org members can manage organization_relations" ON public.organization_relations
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_relations.from_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_relations.from_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "To-org members can read organization_relations" ON public.organization_relations
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_relations.to_organization_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

-- organizations
ALTER POLICY "Users can create organization they own" ON public.organizations
  WITH CHECK (owner_id = (SELECT auth.uid()));

ALTER POLICY "Users can update organization they own" ON public.organizations
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- posts
ALTER POLICY posts_delete ON public.posts
  USING (
    organization_id IN (
      SELECT organization_members.organization_id FROM organization_members
      WHERE organization_members.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY posts_insert ON public.posts
  WITH CHECK (
    organization_id IN (
      SELECT organization_members.organization_id FROM organization_members
      WHERE organization_members.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY posts_update ON public.posts
  USING (
    organization_id IN (
      SELECT organization_members.organization_id FROM organization_members
      WHERE organization_members.user_id = (SELECT auth.uid())
    )
  );

-- profiles
ALTER POLICY "Users can insert own profile" ON public.profiles
  WITH CHECK ((SELECT auth.uid()) = id);

ALTER POLICY "Users can read own profile" ON public.profiles
  USING ((SELECT auth.uid()) = id);

ALTER POLICY "Users can update own profile" ON public.profiles
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- story_views
ALTER POLICY story_views_insert ON public.story_views
  WITH CHECK (viewer_user_id = (SELECT auth.uid()));

ALTER POLICY story_views_select ON public.story_views
  USING (
    post_id IN (
      SELECT p.id FROM posts p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY story_views_update ON public.story_views
  USING (viewer_user_id = (SELECT auth.uid()));

-- trip_assignment_audit (table + policies in 20260516180400_ensure_trip_assignment_audit_table.sql)
DO $$
BEGIN
  IF to_regclass('public.trip_assignment_audit') IS NOT NULL THEN
    ALTER POLICY "Drivers can read trip assignment audit for assigned trips" ON public.trip_assignment_audit
      USING (
        EXISTS (
          SELECT 1 FROM trips t
          JOIN drivers d ON d.id = t.driver_id AND d.user_id = (SELECT auth.uid())
          WHERE t.id = trip_assignment_audit.trip_id
        )
      );

    ALTER POLICY "Org members can insert trip assignment audit" ON public.trip_assignment_audit
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM trips t
          JOIN organization_members om ON om.organization_id = t.organization_id
            AND om.user_id = (SELECT auth.uid())
            AND COALESCE(om.status, 'active') = 'active'
          WHERE t.id = trip_assignment_audit.trip_id
        )
      );

    ALTER POLICY "Org members can read trip assignment audit" ON public.trip_assignment_audit
      USING (
        EXISTS (
          SELECT 1 FROM trips t
          JOIN organization_members om ON om.organization_id = t.organization_id
            AND om.user_id = (SELECT auth.uid())
            AND COALESCE(om.status, 'active') = 'active'
          WHERE t.id = trip_assignment_audit.trip_id
        )
      );
  END IF;
END $$;

-- trip_conversations (policies evolve in later migrations; only alter when present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_conversations' AND policyname = 'Drivers can view their own trip conversations') THEN
    ALTER POLICY "Drivers can view their own trip conversations" ON public.trip_conversations
      USING (
        (driver_id IN (
          SELECT d.id FROM drivers d WHERE d.user_id = (SELECT auth.uid())
        )) OR (organization_id IN (
          SELECT om.organization_id FROM organization_members om
          WHERE om.user_id = (SELECT auth.uid())
        ))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_conversations' AND policyname = 'Linked supplier org reads trip conversations for supplied trips') THEN
    ALTER POLICY "Linked supplier org reads trip conversations for supplied trips" ON public.trip_conversations
      USING (
        (EXISTS (
          SELECT 1 FROM trips t
          JOIN suppliers s ON s.id = t.supplier_id
          JOIN organization_members om ON om.user_id = (SELECT auth.uid())
            AND om.organization_id = s.linked_organization_id
            AND COALESCE(om.status, 'active') = 'active'
          WHERE t.id = trip_conversations.trip_id
        )) OR (EXISTS (
          SELECT 1 FROM trips t
          JOIN direct_quotes dq ON dq.indent_id = t.indent_id
            AND lower(trim(COALESCE(dq.status, ''))) = 'accepted'
          JOIN organization_members om ON om.user_id = (SELECT auth.uid())
            AND om.organization_id = dq.bidder_organization_id
            AND COALESCE(om.status, 'active') = 'active'
          WHERE t.id = trip_conversations.trip_id AND t.indent_id IS NOT NULL
        ))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_conversations' AND policyname = 'Linked supplier via indent reads trip conversations') THEN
    ALTER POLICY "Linked supplier via indent reads trip conversations" ON public.trip_conversations
      USING (
        EXISTS (
          SELECT 1 FROM trips t
          JOIN indents i ON i.id = t.indent_id
          JOIN organization_members om ON om.organization_id = i.assigned_supplier_id
            AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
          WHERE t.id = trip_conversations.trip_id
            AND t.supplier_id IS NULL
            AND t.indent_id IS NOT NULL
            AND i.assigned_supplier_id IS NOT NULL
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_conversations' AND policyname = 'drivers_insert_own_driver_trip_conversation') THEN
    ALTER POLICY drivers_insert_own_driver_trip_conversation ON public.trip_conversations
      WITH CHECK (
        (party_type = 'driver') AND (driver_id IN (
          SELECT d.id FROM drivers d WHERE d.user_id = (SELECT auth.uid())
        )) AND (EXISTS (
          SELECT 1 FROM trips t
          WHERE t.id = trip_conversations.trip_id
            AND t.driver_id = t.driver_id AND t.organization_id = t.organization_id
        ))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_conversations' AND policyname = 'drivers_update_own_driver_trip_conversation') THEN
    ALTER POLICY drivers_update_own_driver_trip_conversation ON public.trip_conversations
      USING (
        (party_type = 'driver') AND (driver_id IN (
          SELECT d.id FROM drivers d WHERE d.user_id = (SELECT auth.uid())
        ))
      )
      WITH CHECK (
        (party_type = 'driver') AND (driver_id IN (
          SELECT d.id FROM drivers d WHERE d.user_id = (SELECT auth.uid())
        )) AND (EXISTS (
          SELECT 1 FROM trips t
          WHERE t.id = trip_conversations.trip_id
            AND t.driver_id = t.driver_id AND t.organization_id = t.organization_id
        ))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_conversations' AND policyname = 'organization_members_can_manage_trip_conversations') THEN
    ALTER POLICY organization_members_can_manage_trip_conversations ON public.trip_conversations
      USING (
        organization_id IN (
          SELECT organization_members.organization_id FROM organization_members
          WHERE organization_members.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- trip_messages
ALTER POLICY "Drivers can send messages in their conversations" ON public.trip_messages
  WITH CHECK (
    (sender_role = 'driver') AND (
      (conversation_id IN (
        SELECT tc.id FROM trip_conversations tc
        JOIN drivers d ON d.id = tc.driver_id
        WHERE d.user_id = (SELECT auth.uid())
      )) OR (organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = (SELECT auth.uid())
      ))
    )
  );

ALTER POLICY "Drivers can view messages in their conversations" ON public.trip_messages
  USING (
    (conversation_id IN (
      SELECT tc.id FROM trip_conversations tc
      JOIN drivers d ON d.id = tc.driver_id
      WHERE d.user_id = (SELECT auth.uid())
    )) OR (organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    ))
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_messages' AND policyname = 'Linked supplier inserts supplier in driver thread') THEN
    ALTER POLICY "Linked supplier inserts supplier in driver thread" ON public.trip_messages
      WITH CHECK (
        (sender_role = 'supplier') AND
        (organization_id = (
          SELECT tc.organization_id FROM trip_conversations tc
          WHERE tc.id = trip_messages.conversation_id
        )) AND (
          (EXISTS (
            SELECT 1 FROM trip_conversations tc
            JOIN trips t ON t.id = tc.trip_id
            JOIN suppliers s ON s.id = t.supplier_id
            JOIN organization_members om ON om.user_id = (SELECT auth.uid())
              AND om.organization_id = s.linked_organization_id AND om.status = 'active'
            WHERE tc.id = trip_messages.conversation_id AND tc.party_type = 'driver'
          )) OR (EXISTS (
            SELECT 1 FROM trip_conversations tc
            JOIN trips t ON t.id = tc.trip_id
            JOIN indents i ON i.id = t.indent_id
            JOIN organization_members om ON om.organization_id = i.assigned_supplier_id
              AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
            WHERE tc.id = trip_messages.conversation_id
              AND tc.party_type = 'driver'
              AND t.supplier_id IS NULL
              AND t.indent_id IS NOT NULL
              AND i.assigned_supplier_id IS NOT NULL
          ))
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_messages' AND policyname = 'Linked supplier org inserts supplier party messages') THEN
    ALTER POLICY "Linked supplier org inserts supplier party messages" ON public.trip_messages
      WITH CHECK (
        (sender_role = 'supplier') AND
        (organization_id = (
          SELECT tc.organization_id FROM trip_conversations tc
          WHERE tc.id = trip_messages.conversation_id
        )) AND (
          (EXISTS (
            SELECT 1 FROM trip_conversations tc
            JOIN trips t ON t.id = tc.trip_id
            JOIN suppliers s ON s.id = t.supplier_id AND s.id = tc.supplier_id
            JOIN organization_members om ON om.user_id = (SELECT auth.uid())
              AND om.organization_id = s.linked_organization_id
              AND COALESCE(om.status, 'active') = 'active'
            WHERE tc.id = trip_messages.conversation_id AND tc.party_type = 'supplier'
          )) OR (EXISTS (
            SELECT 1 FROM trip_conversations tc
            JOIN trips t ON t.id = tc.trip_id
            JOIN direct_quotes dq ON dq.indent_id = t.indent_id
              AND lower(trim(COALESCE(dq.status, ''))) = 'accepted'
            JOIN organization_members om ON om.user_id = (SELECT auth.uid())
              AND om.organization_id = dq.bidder_organization_id
              AND COALESCE(om.status, 'active') = 'active'
            WHERE tc.id = trip_messages.conversation_id
              AND tc.party_type = 'supplier'
              AND t.indent_id IS NOT NULL
              AND tc.supplier_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM suppliers s2
                WHERE s2.id = tc.supplier_id
                  AND s2.linked_organization_id = dq.bidder_organization_id
              )
          ))
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_messages' AND policyname = 'Linked supplier org reads trip messages for supplied trips') THEN
    ALTER POLICY "Linked supplier org reads trip messages for supplied trips" ON public.trip_messages
      USING (
        (EXISTS (
          SELECT 1 FROM trip_conversations tc
          JOIN trips t ON t.id = tc.trip_id
          JOIN suppliers s ON s.id = t.supplier_id
          JOIN organization_members om ON om.user_id = (SELECT auth.uid())
            AND om.organization_id = s.linked_organization_id
            AND COALESCE(om.status, 'active') = 'active'
          WHERE tc.id = trip_messages.conversation_id
        )) OR (EXISTS (
          SELECT 1 FROM trip_conversations tc
          JOIN trips t ON t.id = tc.trip_id
          JOIN direct_quotes dq ON dq.indent_id = t.indent_id
            AND lower(trim(COALESCE(dq.status, ''))) = 'accepted'
          JOIN organization_members om ON om.user_id = (SELECT auth.uid())
            AND om.organization_id = dq.bidder_organization_id
            AND COALESCE(om.status, 'active') = 'active'
          WHERE tc.id = trip_messages.conversation_id AND t.indent_id IS NOT NULL
        ))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_messages' AND policyname = 'Linked supplier via indent reads trip messages') THEN
    ALTER POLICY "Linked supplier via indent reads trip messages" ON public.trip_messages
      USING (
        EXISTS (
          SELECT 1 FROM trip_conversations tc
          JOIN trips t ON t.id = tc.trip_id
          JOIN indents i ON i.id = t.indent_id
          JOIN organization_members om ON om.organization_id = i.assigned_supplier_id
            AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
          WHERE tc.id = trip_messages.conversation_id
            AND t.supplier_id IS NULL
            AND t.indent_id IS NOT NULL
            AND i.assigned_supplier_id IS NOT NULL
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trip_messages' AND policyname = 'organization_members_can_manage_trip_messages') THEN
    ALTER POLICY organization_members_can_manage_trip_messages ON public.trip_messages
      USING (
        organization_id IN (
          SELECT organization_members.organization_id FROM organization_members
          WHERE organization_members.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- trip_otps
ALTER POLICY "Org members can read trip_otps for their trips" ON public.trip_otps
  USING (
    (EXISTS (
      SELECT 1 FROM trips t
      JOIN organization_members om ON om.organization_id = t.organization_id
        AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
      WHERE t.id = trip_otps.trip_id
    )) OR (EXISTS (
      SELECT 1 FROM trips t
      JOIN suppliers s ON s.id = t.supplier_id
      JOIN organization_members om ON om.organization_id = s.linked_organization_id
        AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
      WHERE t.id = trip_otps.trip_id
        AND t.supplier_id IS NOT NULL
        AND s.linked_organization_id IS NOT NULL
    ))
  );

-- trips
ALTER POLICY "Drivers can read own trips" ON public.trips
  USING (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = trips.driver_id AND d.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Drivers can update own trips" ON public.trips
  USING (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = trips.driver_id AND d.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id = trips.driver_id AND d.user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Orgs can read trips where they are the client" ON public.trips
  USING (
    (source = 'manual') AND (EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = trips.client_id
        AND c.linked_organization_id IS NOT NULL
        AND c.linked_organization_id IN (
          SELECT om.organization_id FROM organization_members om
          WHERE om.user_id = (SELECT auth.uid()) AND om.status = 'active'
        )
    ))
  );

ALTER POLICY "Orgs can read trips where they are the supplier" ON public.trips
  USING (
    (indent_id IS NOT NULL) AND (
      (EXISTS (
        SELECT 1 FROM suppliers s
        WHERE s.id = trips.supplier_id
          AND s.linked_organization_id IS NOT NULL
          AND s.linked_organization_id IN (
            SELECT om.organization_id FROM organization_members om
            WHERE om.user_id = (SELECT auth.uid())
              AND COALESCE(om.status, 'active') = 'active'
          )
      )) OR (EXISTS (
        SELECT 1 FROM direct_quotes dq
        WHERE dq.indent_id = trips.indent_id
          AND lower(trim(COALESCE(dq.status, ''))) = 'accepted'
          AND dq.bidder_organization_id IN (
            SELECT om.organization_id FROM organization_members om
            WHERE om.user_id = (SELECT auth.uid())
              AND COALESCE(om.status, 'active') = 'active'
          )
      ))
    )
  );

ALTER POLICY "Supplier org can update trips where they are the supplier" ON public.trips
  USING (
    EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.id = trips.supplier_id
        AND s.linked_organization_id IS NOT NULL
        AND s.linked_organization_id IN (
          SELECT om.organization_id FROM organization_members om
          WHERE om.user_id = (SELECT auth.uid()) AND om.status = 'active'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.id = trips.supplier_id
        AND s.linked_organization_id IS NOT NULL
        AND s.linked_organization_id IN (
          SELECT om.organization_id FROM organization_members om
          WHERE om.user_id = (SELECT auth.uid()) AND om.status = 'active'
        )
    )
  );

-- user_counters
ALTER POLICY user_counters_self_manage ON public.user_counters
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- users
ALTER POLICY users_self_manage ON public.users
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
