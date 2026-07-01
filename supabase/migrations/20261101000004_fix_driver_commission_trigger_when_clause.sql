-- Fix: trg_fill_driver_commission was firing on every trips UPDATE (GPS ticks,
-- odometer writes, status pings) because the guard was inside the function body.
-- Postgres still invokes the function for every row even when the guard returns early.
-- Moving the condition to the WHEN clause eliminates the overhead entirely for
-- non-completion updates — the function is never called unless status transitions
-- to 'completed'.

CREATE OR REPLACE FUNCTION fill_driver_commission()
RETURNS TRIGGER AS $$
DECLARE
  v_commission_percent NUMERIC;
  v_commission_per_km  NUMERIC;
BEGIN
  IF NEW.driver_id IS NULL OR COALESCE(NEW.driver_commission, 0) != 0 THEN
    RETURN NEW;
  END IF;

  SELECT commission_percent, commission_per_km
  INTO v_commission_percent, v_commission_per_km
  FROM drivers
  WHERE id = NEW.driver_id
  LIMIT 1;

  IF COALESCE(v_commission_percent, 0) > 0 AND COALESCE(NEW.client_price, 0) > 0 THEN
    NEW.driver_commission := ROUND(NEW.client_price * v_commission_percent / 100, 2);
  ELSIF COALESCE(v_commission_per_km, 0) > 0 AND COALESCE(NEW.distance, 0) > 0 THEN
    NEW.driver_commission := ROUND(CAST(NEW.distance AS NUMERIC) * v_commission_per_km, 2);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fill_driver_commission ON trips;
CREATE TRIGGER trg_fill_driver_commission
  BEFORE UPDATE ON trips
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION fill_driver_commission();
