-- Audit: manual (non–load-hub) trips should not carry an indent_id, or the app may
-- treat them as integrated_group and show client/supplier chrome incorrectly.
--
-- Adjust the predicate if your schema uses a different "manual" marker than trips.source.

SELECT id, trip_number, indent_id, source, status
FROM public.trips
WHERE indent_id IS NOT NULL
  AND coalesce(source, '') = 'manual'
ORDER BY updated_at DESC
LIMIT 200;
