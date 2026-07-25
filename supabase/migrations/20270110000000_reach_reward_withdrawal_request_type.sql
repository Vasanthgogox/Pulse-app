-- Referral reward withdrawals (Boost V2): drivers withdraw converted
-- recommendation rewards through the existing driver_salary_requests
-- pipeline (driver requests → fleet owner approves & pays), the same flow
-- the Salary tab's green card uses. A dedicated request_type 'reward'
-- keeps these distinguishable from monthly salary / advance / trip
-- commission on both sides of the flow.

ALTER TABLE public.driver_salary_requests
  DROP CONSTRAINT IF EXISTS driver_salary_requests_request_type_check;

ALTER TABLE public.driver_salary_requests
  ADD CONSTRAINT driver_salary_requests_request_type_check
  CHECK (request_type = ANY (ARRAY['monthly'::text, 'advance'::text, 'trip_based'::text, 'reward'::text]));
