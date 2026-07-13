-- Driver salary requests: driver requests salary from the org (fleet); org can Approve & Pay or Reject.
-- Fixes: "Could not find the table 'public.driver_salary_requests' in the schema cache"

CREATE TABLE IF NOT EXISTS "public"."driver_salary_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "driver_id" uuid NOT NULL,
  "request_type" text NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "currency" text DEFAULT 'INR'::text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "note" text,
  "trip_ids" uuid[] DEFAULT '{}'::uuid[],
  "cash_entry_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "created_by" uuid,
  CONSTRAINT "driver_salary_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "driver_salary_requests_amount_check" CHECK (("amount" > (0)::numeric)),
  CONSTRAINT "driver_salary_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['monthly'::text, 'advance'::text, 'trip_based'::text]))),
  CONSTRAINT "driver_salary_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'paid'::text])))
);

ALTER TABLE "public"."driver_salary_requests" OWNER TO "postgres";

COMMENT ON TABLE "public"."driver_salary_requests" IS 'Driver requests salary from the org that assigned trips (supplier/fleet owner). Supplier can Accept & Pay or Reject.';

CREATE INDEX IF NOT EXISTS "idx_driver_salary_requests_created" ON "public"."driver_salary_requests" USING btree ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_driver_salary_requests_driver" ON "public"."driver_salary_requests" USING btree ("driver_id");
CREATE INDEX IF NOT EXISTS "idx_driver_salary_requests_org" ON "public"."driver_salary_requests" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_driver_salary_requests_status" ON "public"."driver_salary_requests" USING btree ("status");

CREATE TRIGGER "driver_salary_requests_updated_at"
  BEFORE UPDATE ON "public"."driver_salary_requests"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_salary_requests_driver_id_fkey') THEN
    ALTER TABLE "public"."driver_salary_requests" ADD CONSTRAINT "driver_salary_requests_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_salary_requests_organization_id_fkey') THEN
    ALTER TABLE "public"."driver_salary_requests" ADD CONSTRAINT "driver_salary_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_salary_requests_created_by_fkey') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
      ALTER TABLE "public"."driver_salary_requests" ADD CONSTRAINT "driver_salary_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
    ELSE
      ALTER TABLE "public"."driver_salary_requests" ADD CONSTRAINT "driver_salary_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_salary_requests_cash_entry_id_fkey') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_entries') THEN
      ALTER TABLE "public"."driver_salary_requests" ADD CONSTRAINT "driver_salary_requests_cash_entry_id_fkey" FOREIGN KEY ("cash_entry_id") REFERENCES "public"."cash_entries"("id") ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

ALTER TABLE "public"."driver_salary_requests" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can insert own driver_salary_requests" ON "public"."driver_salary_requests";
CREATE POLICY "Drivers can insert own driver_salary_requests" ON "public"."driver_salary_requests"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."drivers" d
      WHERE d.id = driver_salary_requests.driver_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Drivers can read own driver_salary_requests" ON "public"."driver_salary_requests";
CREATE POLICY "Drivers can read own driver_salary_requests" ON "public"."driver_salary_requests"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "public"."drivers" d
      WHERE d.id = driver_salary_requests.driver_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org members can manage driver_salary_requests" ON "public"."driver_salary_requests";
CREATE POLICY "Org members can manage driver_salary_requests" ON "public"."driver_salary_requests"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."organization_members" om
      WHERE om.organization_id = driver_salary_requests.organization_id AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."organization_members" om
      WHERE om.organization_id = driver_salary_requests.organization_id AND om.user_id = auth.uid()
    )
  );

GRANT ALL ON TABLE "public"."driver_salary_requests" TO "anon";
GRANT ALL ON TABLE "public"."driver_salary_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_salary_requests" TO "service_role";
