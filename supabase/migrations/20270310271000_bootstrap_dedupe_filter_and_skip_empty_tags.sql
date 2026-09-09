-- DB stability P0, narrow scope (revised after finding the originally-proposed
-- "defer v_long_haul_health past pagination" fix was unsafe: late_flag is part
-- of the ROW_NUMBER() ORDER BY that determines which trips land on the page,
-- not display data attached after selection -- deferring it would silently
-- change trip selection for orgs with a late/critical trip outside the naive
-- recency window. NOT attempted here. late_flag/v_long_haul_health semantics
-- are completely untouched by this migration.
--
-- Two provably-safe, output-identical optimizations only:
--
-- 1. get_initial_chat_state: the "linked-supplier-trips" IN-list subquery
--    (trips linked via suppliers.linked_organization_id, capped at 500) was
--    written out twice -- once in the main row filter, once again inside the
--    ranking subquery's `base` CTE -- both byte-identical. Hoisted into one
--    MATERIALIZED CTE computed once per call, referenced in both places.
--    NOT hoisted: the org-membership check (tc.organization_id =
--    p_organization_id). That check is ROW-level (restricts which
--    trip_conversations rows are visible -- a privacy boundary between
--    parties sharing a trip), while the linked-supplier-trips check is
--    TRIP-level (no per-row org filter). Unifying them into a single
--    candidate-trip-id set would have silently broadened row visibility
--    (any org's trip_conversations row would qualify once the trip_id
--    matched) -- a real regression, not attempted. Same reasoning applies to
--    the bucket/cancelled-status filter (t.status/t0.status) -- left
--    untouched, not hoisted, to keep this change minimal and unambiguous.
--
-- 2. get_unified_b2b_bootstrap: the `tx` LATERAL (3 correlated
--    trip_conversations subqueries computing tags_all_parties/
--    tags_client_supplier/tags_driver_lanes) ran once per conversation
--    regardless of whether that conversation has any messages. Its output is
--    only ever consumed inside the per-message CASE expression, which
--    iterates `conv_row->'messages'` -- when that array is empty (always
--    true for the current caller, which passes p_include_message_bodies=
--    false), tx's computed values are discarded unused. Changed
--    `CROSS JOIN LATERAL` to `LEFT JOIN LATERAL ... ON jsonb_array_length(...)
--    > 0` -- when messages exist, behavior is identical to the CROSS JOIN
--    (the ON condition is true, tx is computed and used exactly as before);
--    when messages are empty, the 3 correlated subqueries are skipped
--    entirely and the (already unused) tx values are NULL instead of
--    computed-then-discarded. Row cardinality is unaffected either way,
--    since tx's own SELECT has no FROM/WHERE that could return zero rows.
--
-- Equivalence proven via rollback-scoped side-by-side comparison against the
-- live functions before this migration was applied (see session notes) --
-- identical trip IDs, ordering, pagination, and JSON structure for: empty
-- org, single trip, multi-trip, exact/under/over page size, non-zero offset,
-- a late/critical-health trip's ranking position, conversations with and
-- without messages.

CREATE OR REPLACE FUNCTION public.get_initial_chat_state(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50,
  p_trip_limit      INT DEFAULT NULL,
  p_trip_offset     INT DEFAULT 0,
  p_hub_trip_bucket TEXT DEFAULT 'active',
  p_include_message_bodies BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket text;
BEGIN
  v_bucket := lower(trim(coalesce(p_hub_trip_bucket, 'active')));
  IF v_bucket NOT IN ('active', 'history', 'all') THEN
    v_bucket := 'active';
  END IF;

  RETURN (
    WITH linked_supplier_trip_ids AS MATERIALIZED (
      SELECT tr.id
      FROM   public.trips tr
      WHERE  tr.status NOT IN ('cancelled')
        AND  EXISTS (
          SELECT 1 FROM public.suppliers s
          WHERE  s.id = tr.supplier_id
            AND  s.linked_organization_id = p_organization_id
        )
      LIMIT 500
    )
    SELECT COALESCE(
      jsonb_agg(c ORDER BY (c->>'last_message_at') DESC NULLS LAST),
      '[]'::jsonb
    )
    FROM (
      SELECT jsonb_build_object(
        'id',                      tc.id,
        'organization_id',         tc.organization_id,
        'trip_organization_id',    t.organization_id,
        'trip_organization_name',  o_trip.name,
        'indent_creator_organization_name',
          (
            COALESCE(
              (
                SELECT o_ind.name::text
                FROM public.indents ind
                JOIN public.organizations o_ind ON o_ind.id = ind.organization_id
                WHERE ind.id = t.indent_id
              ),
              (
                SELECT o_ship.name::text
                FROM public.trips t_ship
                JOIN public.indents ind2 ON ind2.id = t_ship.indent_id
                JOIN public.organizations o_ship ON o_ship.id = ind2.organization_id
                WHERE t_ship.trip_number = t.trip_number
                  AND t_ship.indent_id IS NOT NULL
                  AND ind2.organization_id IS DISTINCT FROM p_organization_id
                LIMIT 1
              )
            )
          ),
        'trip_id',                 tc.trip_id,
        'indent_id',               t.indent_id,
        'party_type',              tc.party_type,
        'party_name',              tc.party_name,
        'client_id',               tc.client_id,
        'supplier_id',             tc.supplier_id,
        'driver_id',               tc.driver_id,
        'last_message_at',         tc.last_message_at,
        'last_message_preview',    tc.last_message_preview,
        'unread_dispatcher_count', COALESCE(tc.unread_dispatcher_count, 0),
        'created_at',              tc.created_at,
        'updated_at',              tc.updated_at,
        'trip_number',             t.trip_number,
        'display_trip_id',         t.display_trip_id,
        'trip_status',             t.status,
        'trip_driver_id',          t.driver_id,
        'trip_supplier_id',        t.supplier_id,
        'trip_created_at',         t.created_at,
        'trip_source',             COALESCE(t.source::text, ''),
        'pickup_area',             t.pickup_area,
        'drop_location',           t.drop_location,
        'trip_feedback_status', (
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM   public.trip_messages m
              WHERE  m.conversation_id = tc.id
                AND  m.message_type IN ('feedback_request', 'feedback')
                AND  (m.metadata->>'submitted_at') IS NOT NULL
            )
            THEN 'rated'
            WHEN EXISTS (
              SELECT 1
              FROM   public.trip_messages m
              WHERE  m.conversation_id = tc.id
                AND  m.message_type IN ('feedback_request', 'feedback')
                AND  (m.metadata->>'submitted_at') IS NULL
                AND  COALESCE(m.metadata->>'rating_status', '') <> 'rated'
            )
            THEN 'pending'
            ELSE 'none'
          END
        ),
        'messages', CASE WHEN p_include_message_bodies THEN COALESCE((
          SELECT jsonb_agg(msg_row ORDER BY msg_row->>'created_at' ASC)
          FROM (
            SELECT jsonb_build_object(
              'id',                 tm.id,
              'conversation_id',    tm.conversation_id,
              'organization_id',    tm.organization_id,
              'sender_user_id',     tm.sender_user_id,
              'sender_role',        tm.sender_role,
              'sender_name',        tm.sender_name,
              'content',            tm.content,
              'message_type',       tm.message_type,
              'metadata',           tm.metadata,
              'is_read',            tm.is_read,
              'read_at',            tm.read_at,
              'created_at',         tm.created_at,
              'sender_avatar_seed', tm.sender_avatar_seed,
              'is_delivered',       COALESCE(tm.is_delivered, FALSE),
              'delivered_at',       tm.delivered_at,
              'reactions',          COALESCE(tm.reactions, '{}'::jsonb),
              'reply_to_id',        tm.reply_to_id,
              'reply_to_preview',   tm.reply_to_preview,
              'edited_at',          tm.edited_at
            ) AS msg_row
            FROM (
              SELECT *
              FROM   public.trip_messages m
              WHERE  m.conversation_id = tc.id
                AND  (
                  m.message_type NOT IN ('ledger_event', 'ledger', 'payment', 'ledger_update')
                  OR COALESCE(
                    nullif(trim(m.metadata->>'sender_org_id'), ''),
                    nullif(trim(m.metadata->'event_payload'->>'sender_org_id'), '')
                  ) = p_organization_id::text
                  OR COALESCE(
                    nullif(trim(m.metadata->>'receiver_org_id'), ''),
                    nullif(trim(m.metadata->'event_payload'->>'receiver_org_id'), '')
                  ) = p_organization_id::text
                )
              ORDER  BY m.created_at DESC
              LIMIT  p_message_limit
            ) tm
          ) sub
        ), '[]'::jsonb) ELSE '[]'::jsonb END
      ) AS c
      FROM  public.trip_conversations tc
      JOIN  public.trips              t ON t.id = tc.trip_id
      LEFT  JOIN public.organizations o_trip ON o_trip.id = t.organization_id
      WHERE (
        tc.organization_id = p_organization_id
        OR tc.trip_id IN (SELECT id FROM linked_supplier_trip_ids)
      )
        AND t.status <> 'cancelled'
        AND (
          v_bucket = 'all'
          OR (
            v_bucket = 'active'
            AND lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'delivered', 'done')
          )
          OR (
            v_bucket = 'history'
            AND lower(trim(coalesce(t.status::text, ''))) IN ('completed', 'delivered', 'done')
          )
        )
        AND (
          p_trip_limit IS NULL
          OR tc.trip_id IN (
            SELECT r.trip_id
            FROM (
              SELECT
                agg.trip_id,
                ROW_NUMBER() OVER (
                  ORDER BY
                    CASE WHEN agg.max_unread > 0 THEN 0 ELSE 1 END,
                    agg.late_flag DESC,
                    agg.last_at DESC NULLS LAST
                ) AS rn
              FROM (
                SELECT
                  base.trip_id,
                  MAX(COALESCE(tc2.unread_dispatcher_count, 0))::int AS max_unread,
                  MAX(tc2.last_message_at) AS last_at,
                  MAX(
                    CASE
                      WHEN h.health_status IN ('LATE_RISK', 'CRITICAL_DELAY')
                      THEN 1
                      ELSE 0
                    END
                  )::int AS late_flag
                FROM (
                  SELECT DISTINCT tc0.trip_id AS trip_id
                  FROM   public.trip_conversations tc0
                  JOIN   public.trips t0 ON t0.id = tc0.trip_id
                  WHERE (
                    tc0.organization_id = p_organization_id
                    OR tc0.trip_id IN (SELECT id FROM linked_supplier_trip_ids)
                  )
                    AND t0.status <> 'cancelled'
                    AND (
                      v_bucket = 'all'
                      OR (
                        v_bucket = 'active'
                        AND lower(trim(coalesce(t0.status::text, ''))) NOT IN ('completed', 'delivered', 'done')
                      )
                      OR (
                        v_bucket = 'history'
                        AND lower(trim(coalesce(t0.status::text, ''))) IN ('completed', 'delivered', 'done')
                      )
                    )
                ) base
                JOIN public.trip_conversations tc2 ON tc2.trip_id = base.trip_id
                LEFT JOIN public.v_long_haul_health h ON h.trip_id = base.trip_id
                GROUP BY base.trip_id
              ) agg
            ) r
            WHERE r.rn > p_trip_offset
              AND r.rn <= p_trip_offset + p_trip_limit
          )
        )
    ) rows
  );
END;
$$;

COMMENT ON FUNCTION public.get_initial_chat_state(UUID, INT, INT, INT, TEXT, BOOL) IS
  'Bootstrap conversations + messages; includes reactions/replies/edits on embedded message rows. '
  'linked_supplier_trip_ids hoisted into one MATERIALIZED CTE (was computed twice, byte-identical).';

CREATE OR REPLACE FUNCTION public.get_unified_b2b_bootstrap(
  p_organization_id UUID,
  p_message_limit   INT DEFAULT 50,
  p_trip_limit      INT DEFAULT NULL,
  p_trip_offset     INT DEFAULT 0,
  p_hub_trip_bucket TEXT DEFAULT 'active',
  p_include_message_bodies BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base       JSONB;
  v_augmented  JSONB;
  v_result     JSONB;
  v_by_context JSONB;
BEGIN
  v_base := public.get_b2b_chat_bootstrap(
    p_organization_id,
    p_message_limit,
    p_trip_limit,
    p_trip_offset,
    p_hub_trip_bucket,
    p_include_message_bodies
  );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        e.elem,
        '{indent_status}',
        coalesce(to_jsonb(NULLIF(trim(ix.status::text), '')), 'null'::jsonb)
      )
      ORDER BY e.ord
    ),
    '[]'::jsonb
  )
  INTO v_augmented
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_base) = 'array' THEN v_base ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(elem, ord)
  CROSS JOIN LATERAL (
    SELECT i.status
    FROM   public.trips t
    LEFT JOIN public.indents i ON i.id = t.indent_id
    WHERE  t.id = NULLIF(TRIM(e.elem->>'trip_id'), '')::uuid
  ) ix;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        jsonb_set(
          conv_row,
          '{conversation_type}',
          CASE
            WHEN nullif(trim(conv_row->>'indent_id'), '') IS NOT NULL THEN to_jsonb('integrated_group'::text)
            ELSE to_jsonb('private_trip'::text)
          END
        ),
        '{messages}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN (msg->>'message_type') IN ('status_change', 'system', 'system_log', 'update', 'location_log') THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(msg, '{visibility_tags}', tx.tags_all_parties),
                      '{routing_context_kind}', to_jsonb('trip'::text)
                    ),
                    '{routing_context_id}', to_jsonb(trim(conv_row->>'trip_id'))
                  )
                WHEN (msg->>'message_type') IN ('ledger_event', 'ledger', 'payment', 'ledger_update') THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          msg,
                          '{visibility_tags}',
                          tx.tags_client_supplier
                        ),
                        '{metadata}',
                        coalesce(msg->'metadata', '{}'::jsonb)
                          || jsonb_build_object('visible_to', jsonb_build_array('client', 'supplier'))
                      ),
                      '{routing_context_kind}',
                      CASE
                        WHEN nullif(trim(conv_row->>'indent_id'), '') IS NOT NULL
                          THEN to_jsonb('indent'::text)
                        ELSE to_jsonb('trip'::text)
                      END
                    ),
                    '{routing_context_id}',
                    CASE
                      WHEN nullif(trim(conv_row->>'indent_id'), '') IS NOT NULL
                        THEN to_jsonb(trim(conv_row->>'indent_id'))
                      ELSE to_jsonb(trim(conv_row->>'trip_id'))
                    END
                  )
                WHEN (msg->>'message_type') = 'tracking' THEN
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(msg, '{visibility_tags}', tx.tags_driver_lanes),
                      '{routing_context_kind}', to_jsonb('trip'::text)
                    ),
                    '{routing_context_id}', to_jsonb(trim(conv_row->>'trip_id'))
                  )
                ELSE
                  jsonb_set(
                    jsonb_set(
                      msg,
                      '{routing_context_kind}', to_jsonb('trip'::text)
                    ),
                    '{routing_context_id}', to_jsonb(trim(conv_row->>'trip_id'))
                  )
              END
              ORDER BY (msg->>'created_at')
            )
            FROM jsonb_array_elements(conv_row->'messages') AS msg
          ),
          '[]'::jsonb
        )
      )
      ORDER BY (conv_row->>'last_message_at') DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM jsonb_array_elements(v_augmented) AS conv_row
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        (
          SELECT jsonb_agg(tc2.id::text ORDER BY tc2.id)
          FROM public.trip_conversations tc2
          WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
        ),
        '[]'::jsonb
      ) AS tags_all_parties,
      COALESCE(
        (
          SELECT jsonb_agg(tc2.id::text ORDER BY tc2.id)
          FROM public.trip_conversations tc2
          WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
            AND tc2.party_type IN ('client', 'supplier')
        ),
        '[]'::jsonb
      ) AS tags_client_supplier,
      COALESCE(
        (
          SELECT jsonb_agg(tc2.id::text ORDER BY tc2.id)
          FROM public.trip_conversations tc2
          WHERE tc2.trip_id = (conv_row->>'trip_id')::uuid
            AND tc2.party_type = 'driver'
        ),
        '[]'::jsonb
      ) AS tags_driver_lanes
  ) AS tx ON jsonb_array_length(coalesce(conv_row->'messages', '[]'::jsonb)) > 0;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'context_kind', g.context_kind,
        'context_id',   g.context_id,
        'message_ids',  g.ids
      )
      ORDER BY g.context_kind, g.context_id
    ),
    '[]'::jsonb
  )
  INTO v_by_context
  FROM (
    SELECT
      trim(both '"' from (m->>'routing_context_kind')) AS context_kind,
      trim(both '"' from (m->>'routing_context_id'))   AS context_id,
      jsonb_agg(DISTINCT to_jsonb(m->>'id') ORDER BY to_jsonb(m->>'id')) AS ids
    FROM jsonb_array_elements(COALESCE(v_result, '[]'::jsonb)) AS c
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c->'messages', '[]'::jsonb)) AS m
    WHERE coalesce(trim(m->>'routing_context_id'), '') <> ''
      AND coalesce(trim(m->>'routing_context_kind'), '') <> ''
      AND coalesce(trim(m->>'id'), '') <> ''
    GROUP BY 1, 2
  ) AS g;

  RETURN jsonb_build_object(
    'conversations',         COALESCE(v_result, '[]'::jsonb),
    'messages_by_context',   COALESCE(v_by_context, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_unified_b2b_bootstrap(UUID, INT, INT, INT, TEXT, BOOL) IS
  'Unified bootstrap: conversations + messages_by_context; indent_status; optional trip window; hub bucket. '
  'tx (tag lookup) LATERAL made conditional on messages being non-empty -- was computed and discarded '
  'unused whenever a conversation had zero messages (always true when p_include_message_bodies=false).';
