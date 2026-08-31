-- WS1 (Gate 4, step 4 of 7): add 'market_award' to drivers.relationship_origin.
--
-- Ships BEFORE market_bids / the shared award engine / accept_market_bid
-- (deliberately reordered from the original draft sequence, per your
-- correction): the schema must be able to accept every value the award
-- engine can produce before that engine is deployed.
--
-- accept_driver_direct_bid() already flagged this exact gap in its own 2026
-- comment: "there is no dedicated 'direct_bid_award' origin in the enum, and
-- this migration does not add one -- flagging that as an open naming
-- question for a future decision, not deciding it here." This migration is
-- that decision. 'market_award' covers BOTH the retrofit of
-- accept_driver_direct_bid() (step 6) and the new accept_market_bid() (step
-- 7) -- one shared value for one shared kind of event (an open-marketplace
-- award created the relationship), not two.
--
-- Constraint name verified against the linked project (read-only
-- pg_constraint query, not assumed): drivers_relationship_origin_check,
-- current definition CHECK ((relationship_origin = ANY (ARRAY[
-- 'phone_assignment'::text, 'invite_accepted'::text, 'manual_add'::text,
-- 'unknown'::text]))). Matches the name used below exactly.
--
-- The live definition has no explicit "OR relationship_origin IS NULL"
-- clause, yet a NULL value already satisfies it today -- a CHECK constraint
-- only fails on FALSE, and `NULL = ANY(array)` evaluates to NULL, never
-- FALSE. The "relationship_origin IS NULL OR ..." below is therefore
-- redundant with Postgres's own CHECK semantics, not a behavior change --
-- kept for readability, not because it alters anything.

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_relationship_origin_check;

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_relationship_origin_check
  CHECK (
    relationship_origin IS NULL
    OR relationship_origin = ANY (
      ARRAY['phone_assignment', 'invite_accepted', 'manual_add', 'unknown', 'market_award']::text[]
    )
  );

COMMENT ON COLUMN public.drivers.relationship_origin IS
  'How this driver relationship began. market_award (WS1, Gate 4) = the row was created by the shared Market/Reach bid award engine (accept_market_bid or accept_driver_direct_bid), never a phone assignment, accepted invite, or manual add. Only stamped on genuine new-row creation -- an existing (organization_id, user_id) row is always reused unchanged.';
