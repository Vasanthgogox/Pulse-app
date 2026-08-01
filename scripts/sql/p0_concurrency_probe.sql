-- Parallel-ish stress: 25 bidder orgs insert bids+quotes in one transaction, then roll back.
-- Reports timing via a result row (NOTICE may be swallowed by CLI).

CREATE TEMP TABLE IF NOT EXISTS p0_probe_result (
  post_id uuid,
  ok int,
  fail int,
  ms numeric
);

TRUNCATE p0_probe_result;

DO $$
DECLARE
  v_post uuid;
  v_indent uuid;
  v_shipper uuid;
  v_orgs uuid[];
  v_i int;
  v_start timestamptz := clock_timestamp();
  v_ok int := 0;
  v_fail int := 0;
  v_user uuid;
BEGIN
  SELECT p.id, p.source_indent_id, p.organization_id
  INTO v_post, v_indent, v_shipper
  FROM public.posts p
  WHERE upper(coalesce(p.type,'')) = 'LOAD'
    AND p.source_indent_id IS NOT NULL
    AND public.indent_open_for_marketplace_bids(p.source_indent_id)
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_post IS NULL THEN
    INSERT INTO p0_probe_result VALUES (NULL, 0, 0, 0);
    RETURN;
  END IF;

  SELECT array_agg(id) INTO v_orgs FROM (
    SELECT o.id
    FROM public.organizations o
    WHERE o.id <> v_shipper
      AND EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = o.id AND m.status = 'active' AND m.user_id IS NOT NULL
      )
    ORDER BY o.created_at
    LIMIT 25
  ) s;

  IF v_orgs IS NULL OR coalesce(array_length(v_orgs,1),0) < 3 THEN
    INSERT INTO p0_probe_result VALUES (v_post, 0, -1, 0);
    RETURN;
  END IF;

  FOR v_i IN 1..LEAST(25, array_length(v_orgs,1)) LOOP
    BEGIN
      SELECT user_id INTO v_user
      FROM public.organization_members
      WHERE organization_id = v_orgs[v_i] AND status='active'
      LIMIT 1;

      INSERT INTO public.bids (post_id, bidder_organization_id, bidder_user_id, amount, note, status)
      VALUES (v_post, v_orgs[v_i], v_user, 17000 + v_i, 'p0-concurrency-probe', 'pending')
      ON CONFLICT DO NOTHING;

      IF FOUND THEN
        INSERT INTO public.direct_quotes (indent_id, bidder_organization_id, amount, notes, status)
        VALUES (v_indent, v_orgs[v_i], 17000 + v_i, 'p0-concurrency-probe', 'pending')
        ON CONFLICT (indent_id, bidder_organization_id) DO NOTHING;
        v_ok := v_ok + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1;
    END;
  END LOOP;

  INSERT INTO p0_probe_result VALUES (
    v_post, v_ok, v_fail,
    round(extract(epoch from (clock_timestamp()-v_start))*1000.0, 1)
  );

  DELETE FROM public.direct_quotes WHERE notes = 'p0-concurrency-probe';
  DELETE FROM public.bids WHERE note = 'p0-concurrency-probe';
END $$;

SELECT * FROM p0_probe_result;
