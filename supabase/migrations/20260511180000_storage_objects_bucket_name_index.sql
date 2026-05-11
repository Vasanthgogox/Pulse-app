-- Speed Storage object lookup / policy evaluation (public render + signed flows).
-- storage.objects is consulted by the Storage API, not Postgres trip queries,
-- but a healthy index here reduces latency when many chat images are resolved.

CREATE INDEX IF NOT EXISTS storage_objects_bucket_id_name_idx
  ON storage.objects (bucket_id, name);

COMMENT ON INDEX storage_objects_bucket_id_name_idx IS
  'Covering common filters on bucket_id + object path (name) for Storage RLS and URL resolution.';
