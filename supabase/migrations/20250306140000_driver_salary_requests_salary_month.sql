-- Add salary_month for monthly salary requests (first day of month, e.g. 2025-03-01).
ALTER TABLE "public"."driver_salary_requests"
  ADD COLUMN IF NOT EXISTS "salary_month" date;

COMMENT ON COLUMN "public"."driver_salary_requests"."salary_month" IS 'For request_type=monthly: the month this salary is for (first day of month).';
