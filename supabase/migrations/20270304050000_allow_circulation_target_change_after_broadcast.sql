-- A2 -- Share an existing (already-broadcast) indent to Marketplace, or stop
-- sharing, without unlocking any other post-broadcast edit.
--
-- enforce_indent_draft_broadcast_rules() currently freezes circulation_target
-- alongside pickup/drop/client/price/vehicle/load_type/pickup_date once an
-- indent is broadcast -- any UPDATE that changes it raises "This indent has
-- been shared and cannot be edited" (confirmed by a real, RLS-enforced
-- UPDATE attempt against a disposable test fixture; rejected cleanly, no
-- partial state).
--
-- Distribution is meant to change after broadcast -- that is the entire
-- point of A2 ("Share to Marketplace" / "Stop sharing" on an existing load).
-- Every other frozen field is untouched: a business still cannot change
-- route, price, vehicle, load type, or pickup date once suppliers may have
-- already quoted against them.
--
-- CREATE OR REPLACE is safe here with no DROP: this is a trigger function
-- (RETURNS trigger), and the return type never changes, so Postgres has no
-- 42P13-style objection and existing grants are untouched automatically.
--
-- Entitlement note: there is currently no subscription/entitlement system
-- anywhere in the schema (checked information_schema for
-- subscriptions/entitlements/billing tables, checked organizations for a
-- plan/tier column -- the only "tier" fields are KYC verification tiers,
-- unrelated). Removing this lock therefore makes circulation_target =
-- marketplace/both changeable by any org that can already edit its own
-- indent (same is_org_member RLS as every other indent field). This is a
-- deliberate, explicit pilot-wide allow -- Marketplace access is not yet
-- gated by a Pilot Pro entitlement because that entitlement does not exist
-- yet. Add the gate here (or in a wrapping RPC) once it does; do not assume
-- this migration already enforces one.
--
-- Not touched: indents schema, Marketplace discovery
-- (list_open_marketplace_loads_for_fleet_owner /
-- indent_open_for_marketplace_bids), market_bids, Reach.

CREATE OR REPLACE FUNCTION public.enforce_indent_draft_broadcast_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'broadcast' AND NEW.shared_at IS NULL THEN
      NEW.shared_at := now();
    END IF;
    IF NEW.status = 'draft' AND NEW.last_saved_at IS NULL THEN
      NEW.last_saved_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'broadcast' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Broadcast indents cannot be reverted to draft'
      USING ERRCODE = '23514';
  END IF;

  -- Lock commercial edits only while the indent stays broadcast. Transitioning
  -- to awarded/completed/cancelled (award path) may stamp the winning rate.
  -- circulation_target is deliberately excluded: distribution (A2 — Share to
  -- Marketplace / Stop sharing) is meant to change post-broadcast.
  IF OLD.status = 'broadcast'
     AND NEW.status = 'broadcast'
     AND (
       NEW.pickup_area IS DISTINCT FROM OLD.pickup_area OR
       NEW.drop_location IS DISTINCT FROM OLD.drop_location OR
       NEW.client_name IS DISTINCT FROM OLD.client_name OR
       NEW.client_price IS DISTINCT FROM OLD.client_price OR
       NEW.supplier_target IS DISTINCT FROM OLD.supplier_target OR
       NEW.vehicle_type IS DISTINCT FROM OLD.vehicle_type OR
       NEW.load_type IS DISTINCT FROM OLD.load_type OR
       NEW.pickup_date IS DISTINCT FROM OLD.pickup_date
     ) THEN
    RAISE EXCEPTION 'This indent has been shared and cannot be edited'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status <> 'broadcast' AND NEW.status = 'broadcast' AND NEW.shared_at IS NULL THEN
    NEW.shared_at := now();
  END IF;

  IF NEW.status = 'draft' THEN
    NEW.last_saved_at := now();
  END IF;

  RETURN NEW;
END;
$function$;
