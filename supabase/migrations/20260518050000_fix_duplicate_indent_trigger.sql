-- FIX: CRITICAL-5
-- Two BEFORE INSERT triggers on indents both call set_indent_number(),
-- causing the organization counter to increment twice per indent.
-- Drop the legacy name; keep trg_set_indent_number (follows naming convention).

DROP TRIGGER IF EXISTS set_indent_number_trigger ON indents;

-- Also drop the duplicate trip trigger pair while here:
-- trips table has set_trip_number_trigger + trg_set_trip_number
DROP TRIGGER IF EXISTS set_trip_number_trigger ON trips;
