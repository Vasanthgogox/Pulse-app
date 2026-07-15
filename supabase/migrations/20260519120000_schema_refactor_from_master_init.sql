-- ============================================================
-- Schema refactor: additive changes from master_init.sql
-- Safe to re-run (idempotent: IF NOT EXISTS / CREATE OR REPLACE)
-- Does NOT: drop columns, change existing types, alter trip status ENUM
-- ============================================================

-- ============================================================
-- STEP 1: Extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- STEP 2: Soft-delete columns
-- ============================================================
ALTER TABLE public.organizations      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.clients            ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.suppliers          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.vehicles           ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.drivers            ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.indents            ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.trips              ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.driver_invites     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.client_warehouses  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.client_contracts   ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ============================================================
-- STEP 2b: Add resolved_at / resolved_by to dispute (needed by resolve_dispute function)
-- ============================================================
ALTER TABLE public.dispute ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.dispute ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id);

-- ============================================================
-- STEP 3: New driver_profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.driver_profiles (
  id                              uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                         uuid NOT NULL UNIQUE,
  license_number                  text,
  license_type                    text,
  license_expiry                  date,
  license_photo_url               text,
  insurance_photo_url             text,
  insurance_expiry                date,
  vehicle_registration            text,
  vehicle_registration_photo_url  text,
  vehicle_registration_expiry     date,
  years_of_experience             integer CHECK (years_of_experience >= 0),
  languages                       text[] DEFAULT '{}',
  preferred_vehicle_types         text[] DEFAULT '{}',
  preferred_areas                 text[] DEFAULT '{}',
  emergency_contact_name          text,
  emergency_contact_phone         text,
  created_at                      timestamptz DEFAULT now(),
  updated_at                      timestamptz DEFAULT now(),
  CONSTRAINT driver_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT driver_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 4: Performance indexes
-- ============================================================

-- pg_trgm fuzzy search
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm
  ON public.clients USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm
  ON public.suppliers USING gin (company_name gin_trgm_ops);

-- Soft-delete partial indexes (now that deleted_at columns exist)
CREATE INDEX IF NOT EXISTS idx_trips_deleted_at
  ON public.trips (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at
  ON public.clients (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_deleted_at
  ON public.suppliers (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_deleted_at
  ON public.drivers (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at
  ON public.vehicles (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_indents_deleted_at
  ON public.indents (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_deleted
  ON public.organizations (deleted_at) WHERE deleted_at IS NULL;

-- Covering index for financial dashboard
CREATE INDEX IF NOT EXISTS idx_trips_finance_cover
  ON public.trips (organization_id, status, pickup_date)
  INCLUDE (client_price, supplier_rate, margin, platform_fee);

-- High-volume tables
CREATE INDEX IF NOT EXISTS idx_driver_locations_trip
  ON public.driver_locations (trip_id, recorded_at DESC) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_locations_org_time
  ON public.driver_locations (organization_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_netmsg_unread
  ON public.network_messages (conversation_id, is_read_by_other) WHERE is_read_by_other = false;
CREATE INDEX IF NOT EXISTS idx_tripmsg_unread
  ON public.trip_messages (conversation_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_trips_payment_status
  ON public.trips (organization_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_posts_expires_at
  ON public.posts (expires_at) WHERE expires_at IS NOT NULL AND is_active = true;

-- ============================================================
-- STEP 5: Helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_organization_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY(
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  );
$$;
GRANT EXECUTE ON FUNCTION public.my_organization_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'active'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.next_indent_number(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq  bigint;
  v_year text := to_char(now(), 'YYYY');
BEGIN
  UPDATE public.organization_counters
  SET indent_seq = indent_seq + 1
  WHERE organization_id = p_org_id
  RETURNING indent_seq INTO v_seq;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Org counter missing for: %', p_org_id;
  END IF;
  RETURN 'IND-' || v_year || '-' || LPAD(v_seq::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_trip_number(p_org_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq  bigint;
  v_year text := to_char(now(), 'YYYY');
BEGIN
  UPDATE public.organization_counters
  SET trip_seq = trip_seq + 1
  WHERE organization_id = p_org_id
  RETURNING trip_seq INTO v_seq;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Org counter missing for: %', p_org_id;
  END IF;
  RETURN 'TRP-' || v_year || '-' || LPAD(v_seq::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_trip_status_summary(p_org_id uuid)
RETURNS TABLE (status text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status::text, COUNT(*) AS count
  FROM public.trips
  WHERE organization_id = p_org_id AND deleted_at IS NULL
  GROUP BY status ORDER BY status;
$$;
GRANT EXECUTE ON FUNCTION public.get_trip_status_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_driver_balance(p_driver_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT balance_after FROM public.driver_ledger
     WHERE driver_id = p_driver_id ORDER BY created_at DESC LIMIT 1),
    0
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_driver_balance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_org_ledger_summary(
  p_org_id uuid,
  p_from   date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to     date DEFAULT CURRENT_DATE
)
RETURNS TABLE (total_in numeric, total_out numeric, net_balance numeric, receivables numeric, payables numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(amount_in), 0),
    COALESCE(SUM(amount_out), 0),
    COALESCE(SUM(amount_in) - SUM(amount_out), 0),
    COALESCE(SUM(CASE WHEN ledger_flow_type = 'receivable' THEN amount_in  ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ledger_flow_type = 'payable'    THEN amount_out ELSE 0 END), 0)
  FROM public.transactions
  WHERE organization_id = p_org_id
    AND transaction_date BETWEEN p_from AND p_to;
$$;
GRANT EXECUTE ON FUNCTION public.get_org_ledger_summary(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_trip(p_trip_id uuid, p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.trips SET deleted_at = now(), updated_at = now()
  WHERE id = p_trip_id AND organization_id = p_org_id AND deleted_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.soft_delete_trip(uuid, uuid) TO authenticated;

-- NOTE: parameter type is text (not ENUM) because driver_ledger.type uses a CHECK constraint
CREATE OR REPLACE FUNCTION public.add_driver_ledger_entry(
  p_org_id         uuid,
  p_driver_id      uuid,
  p_type           text,
  p_amount         numeric,
  p_description    text DEFAULT NULL,
  p_trip_id        uuid DEFAULT NULL,
  p_reference_id   uuid DEFAULT NULL,
  p_reference_type text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance    numeric := 0;
  v_signed     numeric;
  v_entry_id   uuid;
BEGIN
  v_signed := CASE
    WHEN p_type IN ('advance','salary','reimbursement','settlement') THEN  p_amount
    WHEN p_type = 'deduction'                                        THEN -p_amount
    ELSE p_amount
  END;

  SELECT COALESCE(balance_after, 0) INTO v_balance
  FROM public.driver_ledger
  WHERE driver_id = p_driver_id
  ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.driver_ledger
    (organization_id, driver_id, trip_id, type, amount, balance_after,
     description, reference_type, reference_id, created_by)
  VALUES
    (p_org_id, p_driver_id, p_trip_id, p_type, p_amount, v_balance + v_signed,
     p_description, p_reference_type, p_reference_id, auth.uid())
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_driver_ledger_entry(uuid, uuid, text, numeric, text, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_bid(p_bid_id uuid, p_actor_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post_id uuid;
BEGIN
  SELECT post_id INTO v_post_id FROM public.bids WHERE id = p_bid_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = v_post_id AND p.organization_id = p_actor_org_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to accept bids for this post';
  END IF;

  UPDATE public.bids SET status = 'accepted', updated_at = now() WHERE id = p_bid_id;
  UPDATE public.bids SET status = 'rejected', updated_at = now()
    WHERE post_id = v_post_id AND id <> p_bid_id AND status = 'pending';
  UPDATE public.posts SET is_active = false, updated_at = now() WHERE id = v_post_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_bid(uuid, uuid) TO authenticated;

-- NOTE: parameter type is text (not ENUM) because dispute.status uses a CHECK constraint
CREATE OR REPLACE FUNCTION public.resolve_dispute(
  p_dispute_id   uuid,
  p_actor_org_id uuid,
  p_resolution   text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.dispute
  SET status = p_resolution, resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
  WHERE id = p_dispute_id
    AND (raised_by_org_id = p_actor_org_id OR partner_org_id = p_actor_org_id)
    AND status = 'OPEN';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found, not authorized, or already closed';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_driver_latest_location(p_driver_id uuid)
RETURNS TABLE (latitude double precision, longitude double precision, accuracy double precision, recorded_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT latitude, longitude, accuracy, recorded_at
  FROM public.driver_locations
  WHERE driver_id = p_driver_id
  ORDER BY recorded_at DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_driver_latest_location(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_old_posts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.posts SET is_active = false, updated_at = now()
  WHERE expires_at < now() AND is_active = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id uuid,
  p_scope   text,
  p_max     int,
  p_window  interval DEFAULT '1 minute'
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.rpc_rate_limits
  WHERE user_id = p_user_id AND scope = p_scope AND created_at > now() - p_window;
  IF v_count >= p_max THEN RETURN false; END IF;
  INSERT INTO public.rpc_rate_limits (user_id, scope) VALUES (p_user_id, p_scope);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits(p_window interval DEFAULT '1 hour')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.rpc_rate_limits WHERE created_at < now() - p_window;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- STEP 6: Views
-- ============================================================

CREATE OR REPLACE VIEW public.v_active_trips AS
SELECT
  t.id, t.organization_id, t.trip_number, t.status,
  t.pickup_area, t.drop_location, t.pickup_date,
  t.client_name, t.client_price, t.supplier_rate, t.margin,
  t.payment_status, t.driver_display_name, t.vehicle_display_number,
  d.name           AS driver_name,
  d.phone          AS driver_phone,
  d.status         AS driver_current_status,
  v.vehicle_number, v.vehicle_type,
  s.company_name   AS supplier_name
FROM public.trips t
LEFT JOIN public.drivers  d ON d.id = t.driver_id
LEFT JOIN public.vehicles v ON v.id = t.vehicle_id
LEFT JOIN public.suppliers s ON s.id = t.supplier_id
WHERE t.deleted_at IS NULL
  AND t.status NOT IN ('completed', 'cancelled');

CREATE OR REPLACE VIEW public.v_open_indents AS
SELECT
  i.id, i.organization_id, i.indent_number, i.status,
  i.pickup_area, i.drop_location, i.client_name,
  i.client_price, i.supplier_target, i.pickup_date,
  i.vehicle_type, i.weight,
  COUNT(dq.id) AS quote_count
FROM public.indents i
LEFT JOIN public.direct_quotes dq
  ON dq.indent_id = i.id AND dq.status = 'pending'
WHERE i.deleted_at IS NULL
  AND i.status IN ('open', 'broadcast', 'pending', 'quoted')
GROUP BY i.id;

CREATE OR REPLACE VIEW public.v_driver_balances AS
SELECT
  d.id AS driver_id, d.organization_id,
  d.name AS driver_name, d.phone, d.status,
  COALESCE((
    SELECT balance_after FROM public.driver_ledger dl
    WHERE dl.driver_id = d.id ORDER BY dl.created_at DESC LIMIT 1
  ), 0) AS current_balance,
  COALESCE((
    SELECT COUNT(*) FROM public.trips t
    WHERE t.driver_id = d.id AND t.status = 'completed' AND t.deleted_at IS NULL
  ), 0) AS completed_trips
FROM public.drivers d
WHERE d.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_client_revenue AS
SELECT
  t.organization_id, t.client_id,
  c.name           AS client_name,
  COUNT(t.id)      AS total_trips,
  SUM(t.client_price)  AS total_billed,
  SUM(t.amount_paid)   AS total_collected,
  SUM(t.client_price - t.amount_paid) AS outstanding
FROM public.trips t
JOIN public.clients c ON c.id = t.client_id
WHERE t.deleted_at IS NULL AND t.status = 'completed'
GROUP BY t.organization_id, t.client_id, c.name;

ALTER VIEW public.v_active_trips SET (security_invoker = true);
ALTER VIEW public.v_open_indents SET (security_invoker = true);
ALTER VIEW public.v_driver_balances SET (security_invoker = true);
ALTER VIEW public.v_client_revenue SET (security_invoker = true);

-- ============================================================
-- STEP 7: RLS policies for driver_profiles
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'driver_profiles' AND policyname = 'drvprofile_select_own'
  ) THEN
    CREATE POLICY "drvprofile_select_own"
      ON public.driver_profiles FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'driver_profiles' AND policyname = 'drvprofile_insert_own'
  ) THEN
    CREATE POLICY "drvprofile_insert_own"
      ON public.driver_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'driver_profiles' AND policyname = 'drvprofile_update_own'
  ) THEN
    CREATE POLICY "drvprofile_update_own"
      ON public.driver_profiles FOR UPDATE USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'driver_profiles' AND policyname = 'drvprofile_org_view'
  ) THEN
    CREATE POLICY "drvprofile_org_view"
      ON public.driver_profiles FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.drivers d
          JOIN public.organization_members om ON om.organization_id = d.organization_id
          WHERE d.user_id = driver_profiles.user_id AND om.user_id = auth.uid() AND om.status = 'active'
        )
      );
  END IF;
END;
$$;

-- Initplan-safe auth.uid() (same intent as 20260505062038; that migration runs before this table exists).
ALTER POLICY drvprofile_insert_own ON public.driver_profiles
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY drvprofile_org_view ON public.driver_profiles
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      JOIN public.organization_members om ON om.organization_id = d.organization_id
      WHERE d.user_id = driver_profiles.user_id
        AND om.user_id = (SELECT auth.uid()) AND om.status = 'active'
    )
  );

ALTER POLICY drvprofile_select_own ON public.driver_profiles
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY drvprofile_update_own ON public.driver_profiles
  USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- STEP 8: Storage buckets
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('driver-documents', 'driver-documents', false, 5242880,  ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('trip-documents',   'trip-documents',   false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('dispute-evidence', 'dispute-evidence', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf','video/mp4']),
  ('org-assets',       'org-assets',       true,  2097152,  ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('post-media',       'post-media',       true,  5242880,  ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STEP 9: Table comments
-- ============================================================
COMMENT ON TABLE public.trips IS 'Core trip execution table. margin auto-computed GENERATED ALWAYS. Soft-delete via deleted_at.';
COMMENT ON COLUMN public.trips.margin IS 'Auto-computed: client_price - supplier_rate. GENERATED ALWAYS STORED.';
COMMENT ON COLUMN public.trips.deleted_at IS 'Soft-delete timestamp. NULL = active record.';
COMMENT ON TABLE public.drivers IS 'Driver profiles linked to an organization. Soft-delete via deleted_at.';
COMMENT ON TABLE public.vehicles IS 'Fleet vehicles. Soft-delete via deleted_at.';
COMMENT ON TABLE public.clients IS 'Client companies. Soft-delete via deleted_at.';
COMMENT ON TABLE public.suppliers IS 'Supplier companies (asset-based or marketplace). Soft-delete via deleted_at.';
COMMENT ON TABLE public.driver_profiles IS 'Extended driver KYC profile (license, vehicle docs, preferences). One per auth user.';
