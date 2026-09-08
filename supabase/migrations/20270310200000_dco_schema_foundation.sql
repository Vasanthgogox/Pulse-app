-- DCO-4 implementation, part 1/3: additive schema only. No existing table's
-- semantics change; no existing row is rewritten except a cheap, safe
-- backfill of two brand-new columns on trips.
--
-- This is the schema resolved across DCO-1 through DCO-4.1 (all read-only
-- trace/design phases): a DCO (driver-cum-owner / independent owner-operator)
-- is modeled as a separate, person-owned identity -- NOT a suppliers row
-- (suppliers.organization_id is a real, live NOT NULL FK-backed invariant;
-- every suppliers row today means "org X's record of org Y" -- confirmed via
-- pg_constraint and the two live INSERT paths into suppliers, both
-- org-initiated) -- and NOT the existing driver_fleet_owner_profiles/
-- is_driver_fleet_owner() mechanism (a different, legacy, self-service,
-- unapproved capability that happens to gate today's DCO marketplace bidding
-- as a historical accident, confirmed to have only 6 live rows with zero
-- overlap with active organization_members).
--
-- Two new tables, mirroring the two roles DCO-2/DCO-3 identified:
--   dco_profiles -- the administrative/approval relationship. Survives
--     suspension; never deleted. Status lifecycle: PENDING -> APPROVED /
--     REJECTED, APPROVED -> SUSPENDED, SUSPENDED -> APPROVED (reinstate),
--     REJECTED -> PENDING (reopen for re-review). No 'NONE' value: absence
--     of a row IS "NONE", mirroring driver_kyc_submissions' own convention
--     (no row until first submission).
--   dco_payees -- the financial counterparty. Created exactly once, at
--     first approval, and kept permanently thereafter (DCO-3 section 2:
--     "creating it at first approval and retaining it permanently gives us
--     historical integrity" -- a later suspension must not corrupt or
--     dangle the payee identity behind trips already completed).
--
-- trips.supplier_id is a hard FK to suppliers(id) -- confirmed live via
-- pg_get_constraintdef -- so it structurally cannot hold a dco_payees
-- reference; trips.dco_payee_id is a new, separate column, mutually
-- exclusive with supplier_id by a new CHECK constraint. This mirrors DCO-3's
-- resolved design exactly: "trips.dco_payee_id -> normal supplier vs DCO
-- payee, mutually exclusive."
--
-- transactions.contact_id has no FK at all (confirmed live) -- it is
-- disambiguated purely by contact_type/ledger_entity_type. A DCO payment
-- reusing contact_type='supplier' with a non-suppliers UUID would be a
-- semantic lie (DCO-3 approval message, verbatim). 'dco' is added as a
-- genuinely new value to both CHECK constraints. Per the same trace,
-- contact_type='supplier' is embedded in 14 TS files and 7 live SQL
-- functions (get_supplier_ledger_aggregation, aggregateSuppliers.ts, etc.)
-- -- none of them will recognize 'dco' automatically, and none of them are
-- touched by this migration. A DCO ledger-aggregation surface is explicitly
-- future, additive work (DCO-6), not part of this migration.

CREATE TABLE public.dco_profiles (
  user_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid,
  decision_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dco_profiles IS
  'DCO (driver-cum-owner / independent owner-operator) administrative approval status. '
  'One row per person, keyed to profiles.id. Absence of a row means this person has never '
  'requested DCO status. All writes go through SECURITY DEFINER RPCs (request_dco_status, '
  'platform_approve_dco, platform_reject_dco, platform_suspend_dco, platform_reinstate_dco, '
  'dco_reopen_rejected_dco) -- no direct table INSERT/UPDATE RLS policy exists, matching the '
  'principle that approval state must never be settable by the person it describes.';

CREATE TRIGGER set_dco_profiles_updated_at
  BEFORE UPDATE ON public.dco_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.dco_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Person and DCO reviewers can read dco_profiles"
  ON public.dco_profiles FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR public.has_platform_permission((select auth.uid()), 'dco.review')
  );

CREATE TABLE public.dco_payees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES public.dco_profiles(user_id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dco_payees IS
  'DCO financial counterparty -- the entity a DCO trip is settled to. Created exactly once, '
  'at first approval (see platform_approve_dco), and never deleted -- a later suspension of '
  'the linked dco_profiles row does not remove or alter this row, so historical trips remain '
  'resolvable. Referenced by trips.dco_payee_id and (future, DCO-6) transactions.contact_id '
  'when contact_type=''dco''. Intentionally NOT a suppliers row -- see this migration''s header.';

CREATE TRIGGER set_dco_payees_updated_at
  BEFORE UPDATE ON public.dco_payees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.dco_payees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Person and DCO reviewers can read dco_payees"
  ON public.dco_payees FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR public.has_platform_permission((select auth.uid()), 'dco.review')
  );

-- trips: explicit operating_mode axis, independent of execution_type (WHAT
-- physically operates the trip) and trip_payout_mode (HOW the ledger
-- settles) -- three independent axes, not one overloaded field, per DCO-2
-- section 6 / DCO-3 approval. DEFAULT 'FLEET' backfills every existing trip
-- (Postgres computes this via a single metadata change on 11+, not a
-- per-row rewrite) -- no historical trip becomes a DCO trip retroactively;
-- only trips created after DCO-4's marketplace-integration migration ever
-- get 'DCO' written to them.
ALTER TABLE public.trips
  ADD COLUMN operating_mode text NOT NULL DEFAULT 'FLEET' CHECK (operating_mode IN ('FLEET', 'DCO')),
  ADD COLUMN dco_payee_id uuid REFERENCES public.dco_payees(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trips.operating_mode IS
  'WHO is operating this trip: FLEET (org driver/vehicle/supplier) or DCO (independent '
  'owner-operator). Persisted at trip creation, immutable in practice thereafter (no RPC '
  'ever updates it post-insert) -- a later change to the person''s DCO status never rewrites '
  'this on trips already created. Independent of execution_type (ASSET/AGGREGATE) and '
  'trip_payout_mode (asset/market).';

COMMENT ON COLUMN public.trips.dco_payee_id IS
  'The DCO financial counterparty for this trip, when operating_mode=''DCO''. Mutually '
  'exclusive with supplier_id -- see trips_dco_consistency_check. NULL for every FLEET trip.';

ALTER TABLE public.trips
  ADD CONSTRAINT trips_dco_consistency_check CHECK (
    (operating_mode = 'DCO' AND dco_payee_id IS NOT NULL AND supplier_id IS NULL)
    OR (operating_mode = 'FLEET' AND dco_payee_id IS NULL)
  );

-- transactions: add 'dco' as a genuinely new contact_type/ledger_entity_type
-- value. CHECK constraints must be dropped and recreated (Postgres has no
-- ALTER CHECK) -- every other clause is copied verbatim from the live
-- constraint definitions, only the allowed-values array changes.
ALTER TABLE public.transactions DROP CONSTRAINT transactions_contact_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_contact_type_check
  CHECK (contact_type IS NULL OR contact_type = ANY (ARRAY['client', 'supplier', 'driver', 'dco']));

ALTER TABLE public.transactions DROP CONSTRAINT transactions_ledger_entity_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_ledger_entity_type_check
  CHECK (ledger_entity_type IS NULL OR ledger_entity_type = ANY (ARRAY['client', 'supplier', 'driver', 'vehicle', 'platform', 'dco']));
