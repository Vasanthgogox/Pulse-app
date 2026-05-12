-- Shared rate limit for ops-agent-chat Edge Function (cross-isolate, DB-backed).
-- Called only with service_role from the function after JWT verification.

CREATE TABLE IF NOT EXISTS public.ops_agent_rate_log (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start),
  CONSTRAINT ops_agent_rate_log_request_count_nonnegative CHECK (request_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ops_agent_rate_log_window_start
  ON public.ops_agent_rate_log (window_start);

ALTER TABLE public.ops_agent_rate_log ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated; SECURITY DEFINER RPC + service_role only.

COMMENT ON TABLE public.ops_agent_rate_log IS 'Rolling-window counters for ops-agent-chat Edge Function; written only via ops_agent_rate_limit_try_consume.';

REVOKE ALL ON TABLE public.ops_agent_rate_log FROM PUBLIC;
REVOKE ALL ON TABLE public.ops_agent_rate_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ops_agent_rate_limit_try_consume(
  p_user_id uuid,
  p_max_per_window integer DEFAULT 20,
  p_window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket timestamptz;
  v_lock bigint;
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR coalesce(p_max_per_window, 0) < 1 OR coalesce(p_window_seconds, 0) < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_args');
  END IF;

  v_bucket := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);

  v_lock := hashtextextended(p_user_id::text || '|' || extract(epoch from v_bucket)::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock);

  SELECT r.request_count
    INTO v_count
    FROM public.ops_agent_rate_log AS r
   WHERE r.user_id = p_user_id
     AND r.window_start = v_bucket
   FOR UPDATE;

  IF v_count IS NULL THEN
    INSERT INTO public.ops_agent_rate_log (user_id, window_start, request_count)
    VALUES (p_user_id, v_bucket, 1);
    RETURN jsonb_build_object('allowed', true, 'count', 1);
  END IF;

  IF v_count >= p_max_per_window THEN
    RETURN jsonb_build_object('allowed', false, 'count', v_count);
  END IF;

  UPDATE public.ops_agent_rate_log AS r
     SET request_count = r.request_count + 1
   WHERE r.user_id = p_user_id
     AND r.window_start = v_bucket
  RETURNING r.request_count INTO v_count;

  IF random() < 0.02::double precision THEN
    DELETE FROM public.ops_agent_rate_log AS r
     WHERE r.window_start < (clock_timestamp() - interval '2 days');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.ops_agent_rate_limit_try_consume(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ops_agent_rate_limit_try_consume(uuid, integer, integer) TO service_role;

COMMENT ON FUNCTION public.ops_agent_rate_limit_try_consume(uuid, integer, integer) IS 'Atomically increment ops-agent usage for p_user_id in the current time bucket; service_role only. Edge verifies JWT before calling.';
