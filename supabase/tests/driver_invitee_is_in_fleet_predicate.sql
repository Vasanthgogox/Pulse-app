-- get_driver_invitee_by_phone.is_in_fleet regression suite.
--
-- Guards the fix in
-- 20270211090000_driver_invitee_is_in_fleet_relationship_predicate.sql: the
-- Add Driver cross-fleet gate must decide from drivers.relationship_status,
-- never from drivers.tracking_only.
--
-- The invariant being protected: tracking_only is a data-completeness /
-- display flag, not a relationship. Production proved tracking_only = false
-- occurs on active_employee, independent AND NULL rows simultaneously, so it
-- discriminates nothing about fleet membership. If someone reintroduces
-- `AND d.tracking_only = false` (or any tracking_only term) into this
-- predicate, Case B and Case C below fail.
--
-- Every case asserts the ACTUAL boolean returned by the RPC, not merely that
-- the statement executed.
--
-- Fully self-contained: fixtures use a fixed, clearly-fake UUID prefix
-- (bbbb0000-…), assert with RAISE EXCEPTION on failure (fails loudly, safe for
-- CI), and the whole script rolls back so it leaves no trace and is safe to
-- re-run against any environment, including production, as a live sanity check.
-- It never commits and never touches pre-existing rows.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/driver_invitee_is_in_fleet_predicate.sql
-- Pass: every check prints "PASS: ...", script ends with ROLLBACK and no error.
-- Fail: script raises an exception naming the failed check and stops there.

BEGIN;

DO $$
DECLARE
  -- The driver whose phone we look up. Must look like a real driver account to
  -- the RPC: raw_user_meta_data.role = 'driver' and a non-empty phone.
  v_drv_usr   uuid := 'bbbb0000-0000-0000-0000-000000000001';
  -- Owner of the OTHER organisations (must differ from v_drv_usr, else the
  -- o.owner_id <> v_user_id guard excludes the row).
  v_other_own uuid := 'bbbb0000-0000-0000-0000-000000000002';

  v_org_a     uuid := 'bbbb0000-0000-0000-0000-00000000000a';
  v_org_b     uuid := 'bbbb0000-0000-0000-0000-00000000000b';
  v_org_c     uuid := 'bbbb0000-0000-0000-0000-00000000000c';
  v_org_d     uuid := 'bbbb0000-0000-0000-0000-00000000000d';
  v_org_e     uuid := 'bbbb0000-0000-0000-0000-00000000000e';
  v_org_f     uuid := 'bbbb0000-0000-0000-0000-00000000000f';
  v_org_own   uuid := 'bbbb0000-0000-0000-0000-0000000000ff';

  -- Distinctive test phone; last-10 normalisation is what the RPC matches on.
  v_phone     text := '9000000001';

  v_result    boolean;
BEGIN
  -- ── Fixtures ────────────────────────────────────────────────────────────
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (v_drv_usr, 'isinfleet-driver@test.local',
       jsonb_build_object('role', 'driver', 'full_name', 'Test Driver', 'phone', v_phone)),
    (v_other_own, 'isinfleet-owner@test.local',
       jsonb_build_object('role', 'owner', 'full_name', 'Other Owner'));

  -- Six orgs owned by someone else (so rows in them are eligible to block),
  -- plus one owned by the driver themselves (own-org exclusion case).
  INSERT INTO public.organizations (id, name, owner_id) VALUES
    (v_org_a, 'IsInFleet Org A', v_other_own),
    (v_org_b, 'IsInFleet Org B', v_other_own),
    (v_org_c, 'IsInFleet Org C', v_other_own),
    (v_org_d, 'IsInFleet Org D', v_other_own),
    (v_org_e, 'IsInFleet Org E', v_other_own),
    (v_org_f, 'IsInFleet Org F', v_other_own),
    (v_org_own, 'IsInFleet Own Org', v_drv_usr);

  -- ══ Case A: active_employee + tracking_only = false -> BLOCK ════════════
  -- The only state that positively evidences employment (accept_driver_invite,
  -- 20270210092000). Rahul's AlHatheet metals row in production.
  INSERT INTO public.drivers
    (organization_id, user_id, name, phone, relationship_status, tracking_only, left_at)
  VALUES (v_org_a, v_drv_usr, 'Test Driver', v_phone, 'active_employee', false, NULL);

  SELECT is_in_fleet INTO v_result FROM public.get_driver_invitee_by_phone(v_phone);
  IF v_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL Case A: active_employee + tracking_only=false must BLOCK (is_in_fleet=true), got %', v_result;
  END IF;
  RAISE NOTICE 'PASS: Case A — active_employee + tracking_only=false blocks';

  DELETE FROM public.drivers WHERE organization_id = v_org_a;

  -- ══ Case B: independent + tracking_only = false -> ALLOW ════════════════
  -- THE LOAD-BEARING CASE. A real production row has this exact shape, and it
  -- was wrongly blocked by the old tracking_only predicate. This is what
  -- proves the gate now reads relationship semantics rather than having
  -- swapped one incidental correlation for another: tracking_only is false
  -- here, exactly as in Case A, yet the expected outcome is the opposite.
  INSERT INTO public.drivers
    (organization_id, user_id, name, phone, relationship_status, tracking_only, left_at)
  VALUES (v_org_b, v_drv_usr, 'Test Driver', v_phone, 'independent', false, NULL);

  SELECT is_in_fleet INTO v_result FROM public.get_driver_invitee_by_phone(v_phone);
  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL Case B: independent + tracking_only=false must ALLOW (is_in_fleet=false), got % — the predicate is still keying off tracking_only', v_result;
  END IF;
  RAISE NOTICE 'PASS: Case B — independent + tracking_only=false allows (tracking_only is not the discriminator)';

  DELETE FROM public.drivers WHERE organization_id = v_org_b;

  -- ══ Case C: independent + tracking_only = true -> ALLOW ═════════════════
  -- Aggregate phone-assignment stub (assign_aggregate_trip_driver,
  -- 20270210091000: "no employer relationship exists yet"). Deliberately
  -- multi-fleet. Rahul's SpaceXLogistics row in production.
  INSERT INTO public.drivers
    (organization_id, user_id, name, phone, relationship_status, tracking_only, left_at)
  VALUES (v_org_c, v_drv_usr, 'Test Driver', v_phone, 'independent', true, NULL);

  SELECT is_in_fleet INTO v_result FROM public.get_driver_invitee_by_phone(v_phone);
  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL Case C: independent + tracking_only=true must ALLOW (is_in_fleet=false), got %', v_result;
  END IF;
  RAISE NOTICE 'PASS: Case C — independent + tracking_only=true allows';

  DELETE FROM public.drivers WHERE organization_id = v_org_c;

  -- ══ Case D: NULL + tracking_only = false -> BLOCK ═══════════════════════
  -- Unknown relationship. Fail-closed: NULL must never be inferred as
  -- "not employed" (20270210090000 — status is never inferred from absence of
  -- data). 14 humans in production have this shape.
  INSERT INTO public.drivers
    (organization_id, user_id, name, phone, relationship_status, tracking_only, left_at)
  VALUES (v_org_d, v_drv_usr, 'Test Driver', v_phone, NULL, false, NULL);

  SELECT is_in_fleet INTO v_result FROM public.get_driver_invitee_by_phone(v_phone);
  IF v_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL Case D: NULL + tracking_only=false must BLOCK (is_in_fleet=true), got % — NULL is being silently treated as not-employed', v_result;
  END IF;
  RAISE NOTICE 'PASS: Case D — NULL + tracking_only=false blocks (fail-closed)';

  DELETE FROM public.drivers WHERE organization_id = v_org_d;

  -- ══ Case E: NULL + tracking_only = true -> BLOCK ════════════════════════
  -- Same fail-closed rule, and the case that changed behaviour for ~61
  -- production rows: unknown is unknown regardless of tracking_only. Asserting
  -- both D and E is what stops tracking_only re-entering as a tiebreaker for
  -- NULL rows specifically.
  INSERT INTO public.drivers
    (organization_id, user_id, name, phone, relationship_status, tracking_only, left_at)
  VALUES (v_org_e, v_drv_usr, 'Test Driver', v_phone, NULL, true, NULL);

  SELECT is_in_fleet INTO v_result FROM public.get_driver_invitee_by_phone(v_phone);
  IF v_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL Case E: NULL + tracking_only=true must BLOCK (is_in_fleet=true), got %', v_result;
  END IF;
  RAISE NOTICE 'PASS: Case E — NULL + tracking_only=true blocks (fail-closed, tracking_only irrelevant)';

  DELETE FROM public.drivers WHERE organization_id = v_org_e;

  -- ══ Case F: active_employee + left_at IS NOT NULL -> ALLOW ══════════════
  -- Defensive guard on the outer left_at test, NOT a reachable production
  -- shape: leave_fleet (20270210093000) sets left_at AND
  -- relationship_status='disconnected' in the same UPDATE, so a row can never
  -- really be active_employee with left_at set. Asserted anyway so that a
  -- future change which drops the left_at guard fails here rather than
  -- silently blocking every driver who ever left any fleet.
  INSERT INTO public.drivers
    (organization_id, user_id, name, phone, relationship_status, tracking_only, left_at)
  VALUES (v_org_f, v_drv_usr, 'Test Driver', v_phone, 'active_employee', false, now());

  SELECT is_in_fleet INTO v_result FROM public.get_driver_invitee_by_phone(v_phone);
  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL Case F: inactive row (left_at set) must ALLOW (is_in_fleet=false), got %', v_result;
  END IF;
  RAISE NOTICE 'PASS: Case F — inactive row (left_at set) does not block';

  DELETE FROM public.drivers WHERE organization_id = v_org_f;

  -- ══ Case G: active_employee in the driver's OWN org -> ALLOW ════════════
  -- Own-org exclusion (o.owner_id <> v_user_id) preserved from the original
  -- predicate: a driver who owns their organisation is not "in another fleet".
  INSERT INTO public.drivers
    (organization_id, user_id, name, phone, relationship_status, tracking_only, left_at)
  VALUES (v_org_own, v_drv_usr, 'Test Driver', v_phone, 'active_employee', false, NULL);

  SELECT is_in_fleet INTO v_result FROM public.get_driver_invitee_by_phone(v_phone);
  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL Case G: active_employee in own org must ALLOW (is_in_fleet=false), got % — own-org exclusion regressed', v_result;
  END IF;
  RAISE NOTICE 'PASS: Case G — active_employee in driver''s own org does not block';

  DELETE FROM public.drivers WHERE organization_id = v_org_own;

  -- ══ Case H: no active rows at all -> ALLOW ══════════════════════════════
  -- Baseline sanity: with every fixture driver row removed, the same phone
  -- must come back clean. Proves the earlier blocks came from the rows under
  -- test and not from ambient state.
  SELECT is_in_fleet INTO v_result FROM public.get_driver_invitee_by_phone(v_phone);
  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL Case H: driver with no active rows must ALLOW (is_in_fleet=false), got %', v_result;
  END IF;
  RAISE NOTICE 'PASS: Case H — driver with no active rows does not block';

  RAISE NOTICE 'ALL PASS: is_in_fleet decides from relationship_status, not tracking_only';
END $$;

ROLLBACK;
