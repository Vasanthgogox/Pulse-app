-- Driver ledger: org records payments to drivers (salary, settlement, advance, etc.).
-- Driver app Wallet reads own ledger; org members insert/update from Finance.
-- Fixes: "Could not find the table 'public.driver_ledger' in the schema cache"

CREATE TABLE IF NOT EXISTS "public"."driver_ledger" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "driver_id" uuid NOT NULL,
  "trip_id" uuid,
  "type" text NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "currency" text DEFAULT 'INR'::text NOT NULL,
  "balance_after" numeric(12,2),
  "description" text,
  "reference_type" text,
  "reference_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "created_by" uuid,
  CONSTRAINT "driver_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "driver_ledger_type_check" CHECK (
    "type" = ANY (ARRAY['advance'::text, 'settlement'::text, 'salary'::text, 'reimbursement'::text, 'adjustment'::text, 'deduction'::text])
  )
);

ALTER TABLE "public"."driver_ledger" OWNER TO "postgres";

COMMENT ON TABLE "public"."driver_ledger" IS 'All driver financial entries: advance, settlement (trip completion), salary, reimbursement. Positive = credit to driver.';

CREATE INDEX IF NOT EXISTS "idx_driver_ledger_created" ON "public"."driver_ledger" USING btree ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_driver_ledger_driver" ON "public"."driver_ledger" USING btree ("driver_id");
CREATE INDEX IF NOT EXISTS "idx_driver_ledger_org" ON "public"."driver_ledger" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_driver_ledger_trip" ON "public"."driver_ledger" USING btree ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_driver_ledger_type" ON "public"."driver_ledger" USING btree ("type");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_ledger_created_by_fkey') THEN
    ALTER TABLE "public"."driver_ledger" ADD CONSTRAINT "driver_ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_ledger_driver_id_fkey') THEN
    ALTER TABLE "public"."driver_ledger" ADD CONSTRAINT "driver_ledger_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_ledger_organization_id_fkey') THEN
    ALTER TABLE "public"."driver_ledger" ADD CONSTRAINT "driver_ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_ledger_trip_id_fkey') THEN
    ALTER TABLE "public"."driver_ledger" ADD CONSTRAINT "driver_ledger_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "public"."driver_ledger" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can read own ledger" ON "public"."driver_ledger";
CREATE POLICY "Drivers can read own ledger" ON "public"."driver_ledger"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "public"."drivers" d
      WHERE d.id = driver_ledger.driver_id AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org members can manage driver_ledger" ON "public"."driver_ledger";
CREATE POLICY "Org members can manage driver_ledger" ON "public"."driver_ledger"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."organization_members" om
      WHERE om.organization_id = driver_ledger.organization_id AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."organization_members" om
      WHERE om.organization_id = driver_ledger.organization_id AND om.user_id = auth.uid()
    )
  );

GRANT ALL ON TABLE "public"."driver_ledger" TO "anon";
GRANT ALL ON TABLE "public"."driver_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_ledger" TO "service_role";
