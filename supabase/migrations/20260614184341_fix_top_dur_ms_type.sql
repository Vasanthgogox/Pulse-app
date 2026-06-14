-- ops.db_health_snapshots.top_dur_ms is type interval but capture_db_health_snapshot()
-- inserts numeric (milliseconds). No rows have data in this column (all prior inserts
-- failed), so the USING cast is safe.
-- Idempotent: only runs if the column is still interval type.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name   = 'db_health_snapshots'
      AND column_name  = 'top_dur_ms'
      AND data_type    = 'interval'
  ) THEN
    ALTER TABLE ops.db_health_snapshots
      ALTER COLUMN top_dur_ms TYPE numeric
      USING EXTRACT(epoch FROM top_dur_ms) * 1000;
  END IF;
END;
$$;
