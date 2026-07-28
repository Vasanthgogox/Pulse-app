-- Stamp trip_payout_mode on trips created from a direct quote.
--
-- Why: create_trip_from_assigned_indent sets trip_payout_mode, but neither
-- overload of create_trip_from_direct_quote does, so those trips are inserted
-- with mode NULL. getTripExecutionModel() (features/trips/domain/
-- tripExecutionModel.ts) then falls through to its "unset mode" branch, where
-- any non-empty supplier_id means "aggregate". Every direct-quote trip carries
-- a bookkeeping supplier_id (the shipper's supplier row for the winning
-- bidder), so a mover that deployed its OWN driver and vehicle still rendered
-- the aggregate trip-detail UI — no Expense Hub, no driver-payout section.
-- That same file's comment already states the intended contract:
--   "Integrated asset loads with bookkeeping supplier_id must set
--    trip_payout_mode = asset."
--
-- Measured before this migration:
--   source=direct_quote, mode NULL -> 46 trips (35 with own driver + vehicle)
--   source=manual,       mode asset -> 30 trips (29 with own driver + vehicle, 0 supplier)
--   source=manual,       mode market -> 21 trips (0 with own driver+vehicle, 21 supplier)
-- The manual rows establish the convention this migration follows.
--
-- Rule: a trip executed with the deploying org's own driver AND vehicle is
-- 'asset' (the mover pays the driver and books fuel/tolls); otherwise 'market'.
-- Deliberately NOT keyed on supplier_id, which is always present here for
-- bookkeeping and is therefore useless as an asset/market discriminator on
-- this path.
--
-- Only the INSERT's column and VALUES lists change. The patch is applied to the
-- live pg_get_functiondef output so the surrounding logic (row locking,
-- idempotency branch, supplier auto-create, trip_number retry loop) is
-- preserved byte-for-byte, and each step asserts its anchor matched.
--
-- Existing rows are NOT backfilled here; that is a separate data decision.

-- The two overloads are independent implementations with different formatting
-- (the 2-arg one uses `(v_quote).col` on packed lines; the older 1-arg one uses
-- `v_quote.col` one column per line), so each gets its own anchor pair.
DO $mig$
DECLARE
  v_sig    text;
  v_def    text;
  v_before text;
  v_col_from text;
  v_col_to   text;
  v_val_from text;
  v_val_to   text;
  v_case     text := 'CASE WHEN %s.driver_id IS NOT NULL AND %s.vehicle_id IS NOT NULL '
                     || 'THEN ''asset'' ELSE ''market'' END';
  v_sigs   text[] := ARRAY[
    'public.create_trip_from_direct_quote(uuid,text)',
    'public.create_trip_from_direct_quote(uuid)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'expected function % not found', v_sig;
    END IF;

    v_def := pg_get_functiondef(to_regprocedure(v_sig));

    IF position('trip_payout_mode' IN v_def) > 0 THEN
      RAISE NOTICE '% already sets trip_payout_mode — skipping', v_sig;
      CONTINUE;
    END IF;

    IF v_sig = 'public.create_trip_from_direct_quote(uuid,text)' THEN
      v_col_from := 'client_price, supplier_rate, supplier_id,';
      v_col_to   := 'client_price, supplier_rate, supplier_id, trip_payout_mode,';
      v_val_from := 'coalesce((v_quote).amount, 0), v_supplier_id,';
      v_val_to   := 'coalesce((v_quote).amount, 0), v_supplier_id, '
                    || format(v_case, '(v_quote)', '(v_quote)') || ',';
    ELSE
      v_col_from := E'    supplier_id,\n    driver_id,';
      v_col_to   := E'    supplier_id,\n    trip_payout_mode,\n    driver_id,';
      v_val_from := E'    v_supplier_id,\n    v_quote.driver_id,';
      v_val_to   := E'    v_supplier_id,\n    '
                    || format(v_case, 'v_quote', 'v_quote') || E',\n    v_quote.driver_id,';
    END IF;

    v_before := v_def;
    v_def := replace(v_def, v_col_from, v_col_to);
    IF v_def = v_before THEN
      RAISE EXCEPTION 'could not patch column list of % — anchor not found', v_sig;
    END IF;

    v_before := v_def;
    v_def := replace(v_def, v_val_from, v_val_to);
    IF v_def = v_before THEN
      RAISE EXCEPTION 'could not patch VALUES list of % — anchor not found', v_sig;
    END IF;

    EXECUTE v_def;
    RAISE NOTICE 'patched % to stamp trip_payout_mode', v_sig;
  END LOOP;
END
$mig$;
