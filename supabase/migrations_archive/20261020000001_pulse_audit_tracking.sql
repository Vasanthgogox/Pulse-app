-- =============================================================
-- Pulse DB Audit Tracking System
-- Creates the DBA verification layer:
--   pulse_audit_actions     – master list of auditable system actions (seeded)
--   pulse_audit_verifications – per-action verification log
--   trip_status_audit        – fills the biggest coverage blind spot
--   get_db_snapshot()        – live table row counts via RPC
--   get_trigger_coverage()   – pg_catalog trigger info per table via RPC
-- =============================================================

-- ── 1. TRIP STATUS AUDIT (fills the critical blind spot) ───────

CREATE TABLE IF NOT EXISTS public.trip_status_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  org_id      uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  status_from text,
  status_to   text        NOT NULL,
  changed_by  uuid        REFERENCES auth.users(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_status_audit_trip
  ON public.trip_status_audit (trip_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_status_audit_org
  ON public.trip_status_audit (org_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_status_audit_status_to
  ON public.trip_status_audit (status_to);

ALTER TABLE public.trip_status_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_status_audit_org_read" ON public.trip_status_audit;
CREATE POLICY "trip_status_audit_org_read"
  ON public.trip_status_audit FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "trip_status_audit_system_insert" ON public.trip_status_audit;
CREATE POLICY "trip_status_audit_system_insert"
  ON public.trip_status_audit FOR INSERT
  WITH CHECK (true);  -- trigger inserts; RLS for direct inserts locked to org members

CREATE OR REPLACE FUNCTION public.log_trip_status_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.trip_status_audit (trip_id, org_id, status_from, status_to, changed_by)
    VALUES (NEW.id, NEW.organization_id, OLD.status, NEW.status, (SELECT auth.uid()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_status_audit ON public.trips;
CREATE TRIGGER trg_trip_status_audit
  AFTER UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.log_trip_status_change();


-- ── 2. PULSE AUDIT ACTIONS (master tracking list) ──────────────

CREATE TABLE IF NOT EXISTS public.pulse_audit_actions (
  id           text        PRIMARY KEY,            -- '01'..'20'
  seq          integer     NOT NULL,
  action       text        NOT NULL,
  route        text,
  service      text,
  ins_tables   text[]      NOT NULL DEFAULT '{}',
  upd_tables   text[]      NOT NULL DEFAULT '{}',
  del_tables   text[]      NOT NULL DEFAULT '{}',
  trigger_name text,
  audit_table  text,
  priority     text        NOT NULL DEFAULT 'MEDIUM'
                           CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  verify_sql   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulse_audit_actions_priority
  ON public.pulse_audit_actions (priority);

CREATE INDEX IF NOT EXISTS idx_pulse_audit_actions_seq
  ON public.pulse_audit_actions (seq);

ALTER TABLE public.pulse_audit_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pulse_audit_actions_read_all" ON public.pulse_audit_actions;
CREATE POLICY "pulse_audit_actions_read_all"
  ON public.pulse_audit_actions FOR SELECT USING (true);

DROP POLICY IF EXISTS "pulse_audit_actions_write_all" ON public.pulse_audit_actions;
CREATE POLICY "pulse_audit_actions_write_all"
  ON public.pulse_audit_actions FOR ALL USING (true) WITH CHECK (true);


-- ── 3. PULSE AUDIT VERIFICATIONS (verification log) ────────────

CREATE TABLE IF NOT EXISTS public.pulse_audit_verifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id       text        NOT NULL REFERENCES public.pulse_audit_actions(id) ON DELETE CASCADE,
  tester_name     text,
  status          text        NOT NULL DEFAULT 'pass'
                              CHECK (status IN ('pass','fail','partial')),
  notes           text,
  snapshot_before jsonb,
  snapshot_after  jsonb,
  verified_at     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_action_ver UNIQUE (action_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_audit_ver_action
  ON public.pulse_audit_verifications (action_id);

CREATE INDEX IF NOT EXISTS idx_pulse_audit_ver_status
  ON public.pulse_audit_verifications (status);

CREATE INDEX IF NOT EXISTS idx_pulse_audit_ver_verified_at
  ON public.pulse_audit_verifications (verified_at DESC);

ALTER TABLE public.pulse_audit_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pulse_audit_ver_read_all" ON public.pulse_audit_verifications;
CREATE POLICY "pulse_audit_ver_read_all"
  ON public.pulse_audit_verifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "pulse_audit_ver_write_all" ON public.pulse_audit_verifications;
CREATE POLICY "pulse_audit_ver_write_all"
  ON public.pulse_audit_verifications FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_audit_ver_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pulse_audit_ver_updated_at ON public.pulse_audit_verifications;
CREATE TRIGGER trg_pulse_audit_ver_updated_at
  BEFORE UPDATE ON public.pulse_audit_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_ver_updated_at();


-- ── 4. RPC: get_db_snapshot ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_db_snapshot()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'trips',                     (SELECT COUNT(*)::bigint FROM public.trips),
    'trip_assignment_audit',     (SELECT COUNT(*)::bigint FROM public.trip_assignment_audit),
    'trip_workflow_events',      (SELECT COUNT(*)::bigint FROM public.trip_workflow_events),
    'trip_status_audit',         (SELECT COUNT(*)::bigint FROM public.trip_status_audit),
    'trip_location_checkpoints', (SELECT COUNT(*)::bigint FROM public.trip_location_checkpoints),
    'trip_documents',            (SELECT COUNT(*)::bigint FROM public.trip_documents),
    'trip_otps',                 (SELECT COUNT(*)::bigint FROM public.trip_otps),
    'transactions',              (SELECT COUNT(*)::bigint FROM public.transactions),
    'workspace_audit_log',       (SELECT COUNT(*)::bigint FROM public.workspace_audit_log),
    'indents',                   (SELECT COUNT(*)::bigint FROM public.indents),
    'network_bids',              (SELECT COUNT(*)::bigint FROM public.network_bids),
    'drivers',                   (SELECT COUNT(*)::bigint FROM public.drivers),
    'vehicles',                  (SELECT COUNT(*)::bigint FROM public.vehicles),
    'organization_members',      (SELECT COUNT(*)::bigint FROM public.organization_members),
    'trip_messages',             (SELECT COUNT(*)::bigint FROM public.trip_messages),
    'snapped_at',                now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_db_snapshot() TO anon, authenticated;


-- ── 5. RPC: get_trigger_coverage ────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_trigger_coverage()
  RETURNS TABLE(
    tbl        text,
    has_rls    boolean,
    trg_count  bigint,
    trg_names  text[]
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  SELECT
    t.tablename::text,
    c.relrowsecurity,
    COUNT(tr.tgname)::bigint,
    ARRAY_AGG(tr.tgname::text ORDER BY tr.tgname)
      FILTER (WHERE tr.tgname IS NOT NULL AND tr.tgisinternal = false)
  FROM pg_tables t
  JOIN pg_class c
    ON c.relname = t.tablename
   AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LEFT JOIN pg_trigger tr
    ON tr.tgrelid = c.oid
   AND tr.tgisinternal = false
  WHERE t.schemaname = 'public'
    AND t.tablename IN (
      'trips', 'trip_assignment_audit', 'trip_workflow_events',
      'trip_status_audit', 'workspace_audit_log', 'trip_location_checkpoints',
      'trip_otps', 'transactions', 'indents', 'network_bids',
      'organizations', 'organization_members', 'drivers',
      'vehicles', 'trip_documents', 'trip_messages'
    )
  GROUP BY t.tablename, c.relrowsecurity;
$$;

GRANT EXECUTE ON FUNCTION public.get_trigger_coverage() TO anon, authenticated;


-- ── 6. SEED: 20 auditable actions ───────────────────────────────

INSERT INTO public.pulse_audit_actions
  (id, seq, action, route, service, ins_tables, upd_tables, trigger_name, audit_table, priority, verify_sql)
VALUES

('01',1,'Create Trip',
 'app/add-trip.tsx','trips.service.ts',
 ARRAY['trips'],ARRAY[]::text[],NULL,NULL,'HIGH',
 E'SELECT trip_number, status, client_name, created_at\nFROM trips\nORDER BY created_at DESC\nLIMIT 3;'),

('02',2,'Assign Driver',
 'app/trip/[id].tsx','trips.service.ts',
 ARRAY['trip_assignment_audit'],ARRAY['trips.driver_id'],
 'manual INSERT','trip_assignment_audit','HIGH',
 E'SELECT t.trip_number, a.event_type,\n       a.driver_id_new, a.changed_at\nFROM trips t\nJOIN trip_assignment_audit a ON a.trip_id = t.id\nORDER BY a.changed_at DESC\nLIMIT 5;'),

('03',3,'Assign Vehicle',
 'app/trip/[id].tsx','trips.service.ts',
 ARRAY['trip_assignment_audit'],ARRAY['trips.vehicle_id'],
 'manual INSERT','trip_assignment_audit','HIGH',
 E'SELECT t.trip_number, a.event_type,\n       a.vehicle_id_new, a.changed_at\nFROM trips t\nJOIN trip_assignment_audit a ON a.trip_id = t.id\nWHERE a.vehicle_id_new IS NOT NULL\nORDER BY a.changed_at DESC\nLIMIT 5;'),

('04',4,'Trip OTP Verify',
 'app/(driver)/control','trips.service.ts',
 ARRAY['trip_otps'],ARRAY['trips'],NULL,NULL,'HIGH',
 E'SELECT trip_id, otp_code,\n       verified_at, created_at\nFROM trip_otps\nORDER BY created_at DESC\nLIMIT 5;'),

('05',5,'Status → started',
 'app/(driver)/control','trips.service.ts',
 ARRAY['trip_status_audit'],ARRAY['trips.status'],
 'trg_trip_status_audit','trip_status_audit','HIGH',
 E'SELECT trip_id, status_from, status_to,\n       changed_by, changed_at\nFROM trip_status_audit\nWHERE status_to = ''started''\nORDER BY changed_at DESC\nLIMIT 5;'),

('06',6,'Driver Location Ping',
 'app/(driver)/control','— (background)',
 ARRAY['trip_location_checkpoints'],ARRAY['trip_tracking_sessions'],
 NULL,NULL,'MEDIUM',
 E'SELECT trip_id, lat, lng,\n       accuracy_meters, recorded_at\nFROM trip_location_checkpoints\nORDER BY recorded_at DESC\nLIMIT 10;'),

('07',7,'Complete Trip',
 'app/(driver)/control','trips.service.ts',
 ARRAY['trip_workflow_events'],ARRAY['trips.status,completed_at'],
 'trg_log_trip_completed','trip_workflow_events','HIGH',
 E'SELECT trip_id, event_type,\n       payload->>''completed_at'' AS completed_at,\n       payload->>''client_price'' AS client_price\nFROM trip_workflow_events\nWHERE event_type = ''trip.completed''\nORDER BY created_at DESC\nLIMIT 5;'),

('08',8,'Upload POD',
 'app/trip/[id].tsx','— (storage)',
 ARRAY['trip_documents'],ARRAY['trips.pod_status'],
 NULL,NULL,'HIGH',
 E'SELECT td.trip_id, td.file_name,\n       td.document_type, td.created_at\nFROM trip_documents td\nWHERE td.document_type = ''pod''\nORDER BY td.created_at DESC\nLIMIT 5;'),

('09',9,'Generate Invoice',
 'app/(tabs)/finance','invoicing.service.ts',
 ARRAY['trip_workflow_events'],ARRAY[]::text[],
 'manual INSERT','trip_workflow_events','HIGH',
 E'SELECT trip_id, event_type,\n       payload->>''invoice_number'' AS inv_no,\n       payload->>''amount'' AS amount,\n       created_at\nFROM trip_workflow_events\nWHERE event_type = ''invoice.generated''\nORDER BY created_at DESC\nLIMIT 5;'),

('10',10,'Add Ledger Transaction',
 'app/(tabs)/finance','finance.service.ts',
 ARRAY['transactions'],ARRAY[]::text[],NULL,NULL,'HIGH',
 E'SELECT party_name, description,\n       amount_in, amount_out,\n       transaction_date\nFROM transactions\nORDER BY created_at DESC\nLIMIT 5;'),

('11',11,'Record Supplier Payment',
 'app/(tabs)/finance','finance.service.ts',
 ARRAY['transactions','trip_workflow_events'],ARRAY[]::text[],
 'manual INSERT','trip_workflow_events','HIGH',
 E'SELECT trip_id, event_type,\n       payload->>''amount'' AS amount,\n       created_at\nFROM trip_workflow_events\nWHERE event_type = ''supplier.paid''\nORDER BY created_at DESC\nLIMIT 5;'),

('12',12,'Cancel Trip',
 'app/trip/[id].tsx','trips.service.ts',
 ARRAY['trip_status_audit'],ARRAY['trips.status'],
 'trg_trip_status_audit','trip_status_audit','HIGH',
 E'SELECT trip_id, status_from,\n       status_to, changed_at\nFROM trip_status_audit\nWHERE status_to = ''cancelled''\nORDER BY changed_at DESC\nLIMIT 5;'),

('13',13,'Create Indent',
 'app/(tabs)/network','network/indents.service.ts',
 ARRAY['indents'],ARRAY[]::text[],NULL,NULL,'MEDIUM',
 E'SELECT origin_location, destination_location,\n       load_type, rate_per_ton,\n       status, created_at\nFROM indents\nORDER BY created_at DESC\nLIMIT 5;'),

('14',14,'Submit Bid on Indent',
 'app/(tabs)/network','network/bids.service.ts',
 ARRAY['network_bids'],ARRAY['indents.bid_count'],NULL,NULL,'MEDIUM',
 E'SELECT indent_id, org_id, rate,\n       status, created_at\nFROM network_bids\nORDER BY created_at DESC\nLIMIT 5;'),

('15',15,'Award Bid / Match Trip',
 'app/(tabs)/network','network/indents.service.ts',
 ARRAY['trips'],ARRAY['indents.status','network_bids.status'],NULL,NULL,'HIGH',
 E'SELECT i.id, i.status,\n       t.trip_number, t.status AS trip_status\nFROM indents i\nLEFT JOIN trips t ON t.indent_id = i.id\nWHERE i.status = ''awarded''\nORDER BY i.updated_at DESC\nLIMIT 5;'),

('16',16,'KYC / GSTIN Update',
 'app/(workspace)/settings','— (direct update)',
 ARRAY['workspace_audit_log'],ARRAY['organizations.gstin'],
 'trg_log_kyc_change','workspace_audit_log','HIGH',
 E'SELECT event_type,\n       payload->''before''->>''gstin'' AS before,\n       payload->''after'' ->>''gstin'' AS after,\n       actor_id, created_at\nFROM workspace_audit_log\nWHERE event_type = ''kyc.update''\nORDER BY created_at DESC\nLIMIT 5;'),

('17',17,'Invite Org Member',
 'app/(workspace)/team','— (direct insert)',
 ARRAY['organization_members'],ARRAY[]::text[],NULL,NULL,'MEDIUM',
 E'SELECT om.organization_id, p.full_name,\n       om.role, om.status, om.created_at\nFROM organization_members om\nJOIN profiles p ON p.id = om.user_id\nORDER BY om.created_at DESC\nLIMIT 5;'),

('18',18,'Create Driver Record',
 'app/(tabs)/network','drivers.service.ts',
 ARRAY['drivers'],ARRAY[]::text[],NULL,NULL,'MEDIUM',
 E'SELECT name, phone, license_number,\n       status, created_at\nFROM drivers\nORDER BY created_at DESC\nLIMIT 5;'),

('19',19,'Create Vehicle',
 'app/(tabs)/network','— (direct insert)',
 ARRAY['vehicles'],ARRAY[]::text[],NULL,NULL,'LOW',
 E'SELECT registration_number, vehicle_type,\n       capacity_tons, status, created_at\nFROM vehicles\nORDER BY created_at DESC\nLIMIT 5;'),

('20',20,'Send Trip Chat Message',
 'app/(driver)/chat','— (realtime)',
 ARRAY['trip_messages'],ARRAY['trip_conversations.last_msg_at'],NULL,NULL,'LOW',
 E'SELECT tm.trip_id, p.full_name,\n       tm.content, tm.created_at\nFROM trip_messages tm\nJOIN profiles p ON p.id = tm.sender_id\nORDER BY tm.created_at DESC\nLIMIT 10;')

ON CONFLICT (id) DO NOTHING;
