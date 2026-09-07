-- Small, isolated helper reproducing ONLY what extractLedgerMeta
-- (features/finance/services/finance.service.ts:652-668) needs for trip_number
-- recovery -- not a general metadata parser. Used by
-- get_supplier_ledger_aggregation's QMETA fallback path.
--
-- Context: buildUnanchoredLedgerRetryDescription (finance.service.ts:687+)
-- writes a `[[QMETA:{"trip_number":"...",...}]]` blob into a transaction's
-- description when the DB rejects a trip_id anchor -- specifically for
-- cross-org integrated supplier transactions where a direct trip_id FK
-- can't be used. This is a real recovery mechanism, not incidental text.
--
-- buildDescriptionWithMeta always strips any prior meta block before
-- appending a fresh one (stripLedgerMeta, called on every write), so a real
-- description carries at most one such block, always at the very end.
-- Anchoring the extraction to end-of-string therefore reproduces
-- extractLedgerMeta's lastIndexOf-based lookup for every description this
-- app actually writes, without building a general "find the last of
-- multiple occurrences" routine nothing in this app needs.
--
-- Fail-soft parity with JS: JSON.parse failure there returns {} (silently
-- no trip_number); a bare `::jsonb` cast here throws instead of failing
-- soft, so the parse is wrapped in its own BEGIN/EXCEPTION block returning
-- NULL on any malformed payload -- matching the JS try/catch outcome
-- exactly, not merely approximating it.
--
-- Pure computation on the input text, no table access -- SECURITY INVOKER
-- (the default; not declared DEFINER since there is no privilege boundary
-- to cross), search_path pinned to '' since nothing here is schema-qualified.

CREATE OR REPLACE FUNCTION public.extract_ledger_meta_trip_number(p_description text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_encoded     text;
  v_json        jsonb;
  v_trip_number text;
BEGIN
  IF p_description IS NULL THEN
    RETURN NULL;
  END IF;

  v_encoded := substring(p_description FROM '\[\[QMETA:(.*)\]\]\s*$');
  IF v_encoded IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_json := v_encoded::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  v_trip_number := trim(coalesce(v_json ->> 'trip_number', ''));
  IF v_trip_number = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_trip_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.extract_ledger_meta_trip_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extract_ledger_meta_trip_number(text) TO authenticated;
