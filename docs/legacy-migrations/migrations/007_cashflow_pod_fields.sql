-- 007_cashflow_pod_fields.sql
-- Adds missing tables and columns for the Log Incoming PODs feature (Cashflow port).

-- 1. Add missing columns to trips if they don't exist
ALTER TABLE public.trips 
  ADD COLUMN IF NOT EXISTS lr_no text,
  ADD COLUMN IF NOT EXISTS pod_status text,
  ADD COLUMN IF NOT EXISTS pod_received_date date,
  ADD COLUMN IF NOT EXISTS invoice_no text,
  ADD COLUMN IF NOT EXISTS invoice_status_1 text,
  ADD COLUMN IF NOT EXISTS invoice_status_2 text;

-- 2. Create trip_lrs table
CREATE TABLE IF NOT EXISTS public.trip_lrs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
    lr_number text NOT NULL,
    pod_received boolean DEFAULT false,
    pod_status text,
    status text,
    invoice_status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS for trip_lrs
ALTER TABLE public.trip_lrs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'trip_lrs' AND policyname = 'Enable all for authenticated'
    ) THEN
        CREATE POLICY "Enable all for authenticated" ON public.trip_lrs TO authenticated USING (true) WITH CHECK (true);
    END IF;
END
$$;

-- 3. Create log_activity function (RPC)
CREATE OR REPLACE FUNCTION public.log_activity(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- We don't have an activity_logs table in base schema yet, so we'll just ignore or create one.
  -- To prevent errors, we'll ensure the table exists or just do nothing.
  -- For now, let's create a basic activity_logs table if it doesn't exist and insert.
  
  -- Create table if it doesn't exist (done implicitly by just doing an insert if we know it exists, but since we are in a function we can't CREATE TABLE easily without dynamic SQL).
  -- We will just insert if the table exists, otherwise ignore, or we create the table first outside.
END;
$$;

-- Actually, let's create the activity_logs table first outside the function so the function can insert into it.
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Recreate the function to actually insert
CREATE OR REPLACE FUNCTION public.log_activity(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.activity_logs (action, entity_type, entity_id, details)
  VALUES (p_action, p_entity_type, p_entity_id, p_details);
END;
$$;
