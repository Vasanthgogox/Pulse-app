-- RPC: match_driver_by_phone
-- Folds exact-phone + last-10-digits fallback into a single SQL predicate.
-- Replaces the multi-step sequential query cascade in ensureDriverRowByPhone.
CREATE OR REPLACE FUNCTION match_driver_by_phone(
  p_org_id           UUID,
  p_phone            TEXT,
  p_require_unlinked BOOLEAN DEFAULT FALSE
)
RETURNS SETOF drivers
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM   drivers
  WHERE  organization_id = p_org_id
    AND  (NOT p_require_unlinked OR user_id IS NULL)
    AND  phone IS NOT NULL
    AND  (
           phone = p_phone
           OR RIGHT(REGEXP_REPLACE(phone,   '[^0-9]', '', 'g'), 10)
              = RIGHT(REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g'), 10)
         )
  ORDER BY
    (CASE WHEN phone = p_phone THEN 0 ELSE 1 END),  -- exact match first
    (CASE WHEN user_id IS NULL THEN 0 ELSE 1 END)   -- unlinked first when both present
  LIMIT 1;
$$;
