-- Migration: Sequential ID Generation for Trips, Indents, and Loads
-- Created: 2026-04-20
-- Description: User-scoped sequential ID generation (TRP001, IND001, LOAD001).

-- 1. Create public.users if it doesn't exist (referencing auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Backfill public.users from public.profiles if empty
INSERT INTO public.users (id, name)
SELECT id, coalesce(full_name, 'User')
FROM public.profiles
ON CONFLICT (id) DO NOTHING;

-- Also ensure all organization owners are in public.users
INSERT INTO public.users (id, name)
SELECT DISTINCT owner_id, 'Organization Owner'
FROM public.organizations
WHERE owner_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 2. Create user_counters table for sequential ID tracking per user
CREATE TABLE IF NOT EXISTS public.user_counters (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  trip_seq bigint NOT NULL DEFAULT 0,
  indent_seq bigint NOT NULL DEFAULT 0,
  load_seq bigint NOT NULL DEFAULT 0
);

-- 3. Alter indents table: add ownership columns
ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Backfill indents ownership from organizations (legacy)
UPDATE public.indents i
SET owner_user_id = o.owner_id
FROM public.organizations o
JOIN public.users u ON u.id = o.owner_id
WHERE i.organization_id = o.id
  AND i.owner_user_id IS NULL;

-- 4. Alter trips table: add ownership columns
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Backfill trips ownership from organizations (legacy)
UPDATE public.trips t
SET owner_user_id = o.owner_id
FROM public.organizations o
JOIN public.users u ON u.id = o.owner_id
WHERE t.organization_id = o.id
  AND t.owner_user_id IS NULL;

-- 5. Create loads table
CREATE TABLE IF NOT EXISTS public.loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  load_number text, -- Populated by trigger
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  indent_id uuid REFERENCES public.indents(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loads_owner_user_id ON public.loads(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_loads_trip_id ON public.loads(trip_id);
CREATE INDEX IF NOT EXISTS idx_loads_indent_id ON public.loads(indent_id);

-- Helper to check column existence
CREATE OR REPLACE FUNCTION public.column_exists(p_schema text, p_table text, p_column text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = p_schema AND table_name = p_table AND column_name = p_column
  );
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger functions for sequential IDs

-- Indent Number Trigger
CREATE OR REPLACE FUNCTION public.set_indent_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.indent_number IS NULL OR trim(NEW.indent_number) = '' THEN
    -- Ensure counter exists for the owner_user_id
    INSERT INTO public.user_counters (user_id)
    VALUES (NEW.owner_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Atomically increment and retrieve the sequence
    UPDATE public.user_counters
    SET indent_seq = indent_seq + 1
    WHERE user_id = NEW.owner_user_id
    RETURNING indent_seq INTO seq;

    NEW.indent_number := 'IND' || lpad(seq::text, 3, '0');
    
    -- Also set display_indent_id for consistency with existing UI patterns
    IF public.column_exists('public', 'indents', 'display_indent_id') THEN
      NEW.display_indent_id := NEW.indent_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trip Number Trigger
CREATE OR REPLACE FUNCTION public.set_trip_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.trip_number IS NULL OR trim(NEW.trip_number) = '' THEN
    -- Ensure counter exists for the owner_user_id
    INSERT INTO public.user_counters (user_id)
    VALUES (NEW.owner_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Atomically increment and retrieve the sequence
    UPDATE public.user_counters
    SET trip_seq = trip_seq + 1
    WHERE user_id = NEW.owner_user_id
    RETURNING trip_seq INTO seq;

    NEW.trip_number := 'TRP' || lpad(seq::text, 3, '0');
    
    -- Also set display_trip_id for consistency with existing UI patterns
    IF public.column_exists('public', 'trips', 'display_trip_id') THEN
      NEW.display_trip_id := NEW.trip_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Load Number Trigger
CREATE OR REPLACE FUNCTION public.set_load_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.load_number IS NULL OR trim(NEW.load_number) = '' THEN
    -- Ensure counter exists for the owner_user_id
    INSERT INTO public.user_counters (user_id)
    VALUES (NEW.owner_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Atomically increment and retrieve the sequence
    UPDATE public.user_counters
    SET load_seq = load_seq + 1
    WHERE user_id = NEW.owner_user_id
    RETURNING load_seq INTO seq;

    NEW.load_number := 'LOAD' || lpad(seq::text, 3, '0');
    
    -- Also set display_load_id if it exists
    IF public.column_exists('public', 'loads', 'display_load_id') THEN
      NEW.display_load_id := NEW.load_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. Apply triggers to tables

DROP TRIGGER IF EXISTS trg_set_indent_number ON public.indents;
CREATE TRIGGER trg_set_indent_number
  BEFORE INSERT ON public.indents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_indent_number();

DROP TRIGGER IF EXISTS trg_set_trip_number ON public.trips;
CREATE TRIGGER trg_set_trip_number
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_trip_number();

DROP TRIGGER IF EXISTS trg_set_load_number ON public.loads;
CREATE TRIGGER trg_set_load_number
  BEFORE INSERT ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_load_number();

-- 8. Update RPCs for Awarding Indents to Trips

-- Single award
CREATE OR REPLACE FUNCTION public.award_indent_to_trip(
  p_indent_id uuid,
  p_supplier_rate numeric DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_supplier_org_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  p_vehicle_display_number text DEFAULT NULL
)
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_indent public.indents%ROWTYPE;
  v_trip public.trips%ROWTYPE;
  v_org_id uuid;
  v_supplier_id uuid;
  v_rate numeric;
BEGIN
  -- 1. Fetch indent
  SELECT * INTO v_indent FROM public.indents WHERE id = p_indent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent % not found', p_indent_id;
  END IF;

  v_org_id := v_indent.organization_id;

  -- 2. Authorization check
  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not authorized to award indent %', p_indent_id;
  END IF;

  -- 3. Idempotency check: if trip already exists, return it
  SELECT * INTO v_trip FROM public.trips WHERE indent_id = p_indent_id LIMIT 1;
  IF FOUND THEN
    -- Optionally update driver/vehicle if provided
    UPDATE public.trips
    SET
      driver_id = COALESCE(p_driver_id, driver_id),
      vehicle_id = COALESCE(p_vehicle_id, vehicle_id),
      vehicle_display_number = COALESCE(p_vehicle_display_number, vehicle_display_number),
      updated_at = now()
    WHERE id = (v_trip).id;
    
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  -- 4. Resolve supplier_id
  v_supplier_id := p_supplier_id;
  IF v_supplier_id IS NULL AND p_supplier_org_id IS NOT NULL THEN
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE organization_id = v_org_id
      AND linked_organization_id = p_supplier_org_id
    LIMIT 1;
  END IF;

  -- 5. Resolve rate
  v_rate := COALESCE(p_supplier_rate, v_indent.supplier_target, 0);

  -- 6. Create trip
  INSERT INTO public.trips (
    organization_id,
    owner_user_id,
    created_by_user_id,
    trip_number,
    indent_id,
    source,
    pickup_area,
    drop_location,
    pickup_lat,
    pickup_lon,
    drop_lat,
    drop_lon,
    distance,
    estimated_duration,
    client_name,
    client_id,
    client_price,
    supplier_rate,
    supplier_id,
    driver_id,
    vehicle_id,
    vehicle_display_number,
    status,
    pickup_date,
    load_type,
    notes,
    platform_fee,
    driver_commission,
    payment_status,
    amount_paid
  ) VALUES (
    v_org_id,
    (v_indent).owner_user_id,
    auth.uid(),
    '',                                       -- DB trigger sets trip_number
    p_indent_id,
    'indent_conversion',
    COALESCE((v_indent).pickup_area, ''),
    COALESCE((v_indent).drop_location, ''),
    (v_indent).pickup_lat,
    (v_indent).pickup_lon,
    (v_indent).drop_lat,
    (v_indent).drop_lon,
    (v_indent).distance,
    (v_indent).estimated_duration,
    COALESCE((v_indent).client_name, ''),
    (v_indent).client_id,
    COALESCE((v_indent).client_price, 0),
    v_rate,
    v_supplier_id,
    p_driver_id,
    p_vehicle_id,
    p_vehicle_display_number,
    'assigned',
    (v_indent).pickup_date,
    (v_indent).load_type,
    (v_indent).notes,
    0,
    0,
    'pending',
    0
  )
  RETURNING * INTO v_trip;

  -- 7. Mark indent completed
  UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = p_indent_id;

  RETURN NEXT v_trip;
END;
$$;

-- Batch award
CREATE OR REPLACE FUNCTION public.batch_award_indents_to_trips(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH to_convert AS (
    SELECT i.*
    FROM public.indents i
    LEFT JOIN public.trips t ON t.indent_id = i.id
    WHERE i.organization_id = p_org_id
      AND i.status = 'awarded'
      AND t.id IS NULL
  ),
  inserted AS (
    INSERT INTO public.trips (
      organization_id,
      owner_user_id,
      created_by_user_id,
      trip_number,
      indent_id,
      source,
      pickup_area,
      drop_location,
      pickup_lat,
      pickup_lon,
      drop_lat,
      drop_lon,
      distance,
      estimated_duration,
      client_name,
      client_id,
      client_price,
      supplier_rate,
      supplier_id,
      status,
      pickup_date,
      load_type,
      notes,
      platform_fee,
      driver_commission,
      payment_status,
      amount_paid
    )
    SELECT
      tc.organization_id,
      tc.owner_user_id,
      auth.uid(),
      '',
      tc.id,
      'batch_conversion',
      tc.pickup_area,
      tc.drop_location,
      tc.pickup_lat,
      tc.pickup_lon,
      tc.drop_lat,
      tc.drop_lon,
      tc.distance,
      tc.estimated_duration,
      tc.client_name,
      tc.client_id,
      tc.client_price,
      tc.supplier_target,
      tc.assigned_supplier_id,
      'assigned',
      tc.pickup_date,
      tc.load_type,
      tc.notes,
      0,
      0,
      'pending',
      0
    FROM to_convert tc
    RETURNING id
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  UPDATE public.indents
  SET status = 'completed', updated_at = now()
  WHERE id IN (
    SELECT tc.id FROM public.indents tc
    LEFT JOIN public.trips t ON t.indent_id = tc.id
    WHERE tc.organization_id = p_org_id
      AND tc.status = 'awarded'
      AND t.id IS NOT NULL
  );

  RETURN v_inserted;
END;
$$;

-- Create trip from direct quote
CREATE OR REPLACE FUNCTION public.create_trip_from_direct_quote(
  p_quote_id uuid,
  p_vehicle_display_number text DEFAULT NULL
)
RETURNS SETOF public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.direct_quotes%ROWTYPE;
  v_indent public.indents%ROWTYPE;
  v_supplier_id uuid;
  v_org_id uuid;
  v_trip public.trips%ROWTYPE;
  v_vehicle_display text;
BEGIN
  v_vehicle_display := NULLIF(TRIM(COALESCE(p_vehicle_display_number, '')), '');

  SELECT * INTO v_quote FROM public.direct_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Direct quote not found';
  END IF;
  IF (v_quote.status IS NULL OR lower(v_quote.status) <> 'accepted') THEN
    RAISE EXCEPTION 'Quote must be accepted before creating a trip';
  END IF;

  SELECT * INTO v_indent FROM public.indents WHERE id = (v_quote).indent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indent not found';
  END IF;

  v_org_id := v_indent.organization_id;

  IF NOT (
    public.is_org_member(v_org_id) OR public.is_org_member((v_quote).bidder_organization_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to create trip from this quote';
  END IF;

  -- Idempotent: if a trip already exists for this indent
  SELECT t.* INTO v_trip
  FROM public.trips t
  WHERE t.indent_id = (v_quote).indent_id
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.trips
    SET
      driver_id = COALESCE((v_quote).driver_id, driver_id),
      vehicle_id = COALESCE((v_quote).vehicle_id, vehicle_id),
      updated_at = now(),
      vehicle_display_number = CASE
        WHEN v_vehicle_display IS NOT NULL THEN v_vehicle_display
        ELSE vehicle_display_number
      END
    WHERE id = (v_trip).id;
    SELECT * INTO v_trip FROM public.trips WHERE id = (v_trip).id;
    UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;
    RETURN NEXT v_trip;
    RETURN;
  END IF;

  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND linked_organization_id = (v_quote).bidder_organization_id
  LIMIT 1;

  INSERT INTO public.trips (
    organization_id,
    owner_user_id,
    created_by_user_id,
    trip_number,
    indent_id,
    source,
    pickup_area,
    drop_location,
    client_name,
    client_price,
    supplier_rate,
    supplier_id,
    driver_id,
    vehicle_id,
    status,
    pickup_date,
    load_type,
    vehicle_display_number,
    platform_fee,
    driver_commission,
    payment_status,
    amount_paid
  ) VALUES (
    v_org_id,
    (v_indent).owner_user_id,
    auth.uid(),
    '',                                       -- DB trigger sets trip_number
    (v_quote).indent_id,
    'direct_quote',
    coalesce((v_indent).pickup_area, ''),
    coalesce((v_indent).drop_location, ''),
    coalesce((v_indent).client_name, ''),
    coalesce((v_indent).client_price, 0),
    coalesce((v_quote).amount, 0),
    v_supplier_id,
    (v_quote).driver_id,
    (v_quote).vehicle_id,
    'assigned',
    (v_indent).pickup_date,
    coalesce((v_indent).load_type, ''),
    v_vehicle_display,
    0,
    0,
    'pending',
    0
  )
  RETURNING * INTO v_trip;

  UPDATE public.indents SET status = 'completed', updated_at = now() WHERE id = (v_quote).indent_id;

  RETURN NEXT v_trip;
  RETURN;
END;
$$;
