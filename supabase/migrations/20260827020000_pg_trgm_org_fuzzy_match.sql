-- Trigram fuzzy matching for Indian company name resolution.
-- Enables find_org_matches_for_counterparty() to match "Sharma Transport"
-- against "Sharma Transport Pvt Ltd" without external services.
--
-- Also provides normalize_phone_number() for phone-boosted ranking.
-- Phone is a ranking signal only — never exposed in the response shape.
--
-- Rollback:
--   DROP FUNCTION normalize_phone_number(text);
--   DROP FUNCTION find_org_matches_for_counterparty(text, float, text);
--   DROP INDEX CONCURRENTLY idx_organizations_name_trgm;
--   (leave pg_trgm — it may be used by other queries)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on organizations.name.
-- Without this, similarity() performs a sequential scan of the full orgs table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_name_trgm
  ON organizations USING GIN (name gin_trgm_ops);

-- ── Phone normalizer ──────────────────────────────────────────────────────────
-- Mirrors lib/phoneNormalization.ts logic as closely as SQL allows.
-- IMMUTABLE: safe to use in indexes and as a computed column.
--
-- Rules (Indian-first, E.164-like output):
--   1. Strip spaces, dashes, parens, dots.
--   2. 0 + 10 digits → +91{10 digits}
--   3. 91 + 10 digits (no +) → +91{10 digits}
--   4. Plain 10 digits → +91{10 digits}
--   5. +{digits} → preserve (already canonical)
--   6. < 8 digits → NULL
--
-- Does NOT return phone values in any public-facing RPC response.
--
-- Rollback: DROP FUNCTION normalize_phone_number(text);

CREATE OR REPLACE FUNCTION normalize_phone_number(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    -- Reject NULL / empty
    WHEN p IS NULL OR TRIM(p) = '' THEN NULL

    ELSE (
      WITH stripped AS (
        -- Remove formatting chars; keep only digits and leading +
        SELECT
          TRIM(p) ~ '^\+' AS has_plus,
          REGEXP_REPLACE(TRIM(p), '[\s\-().]', '', 'g') AS cleaned
      ),
      digits_only AS (
        SELECT
          has_plus,
          REGEXP_REPLACE(cleaned, '[^0-9]', '', 'g') AS digits
        FROM stripped
      )
      SELECT CASE
        -- Too short to be a real number
        WHEN LENGTH(digits) < 8 THEN NULL

        -- 0XXXXXXXXXX (leading 0 + 10 digits) → +91 + 10 digits
        WHEN NOT has_plus AND LENGTH(digits) = 11 AND digits LIKE '0%'
          THEN '+91' || SUBSTRING(digits FROM 2)

        -- 91XXXXXXXXXX (12 digits, no +, starts with 91) → +91 + 10 digits
        WHEN NOT has_plus AND LENGTH(digits) = 12 AND digits LIKE '91%'
          THEN '+91' || SUBSTRING(digits FROM 3)

        -- Bare 10 digits → +91 + 10 digits (Indian default)
        WHEN NOT has_plus AND LENGTH(digits) = 10
          THEN '+91' || digits

        -- Already had a leading + → canonical E.164
        WHEN has_plus AND LENGTH(digits) BETWEEN 8 AND 15
          THEN '+' || digits

        -- Cannot classify
        ELSE NULL
      END
      FROM digits_only
    )
  END
$$;

GRANT EXECUTE ON FUNCTION normalize_phone_number(text) TO authenticated;

-- ── Fuzzy match function with optional phone bonus ────────────────────────────
-- Finds platform orgs whose normalized name is similar to a raw counterparty string.
-- Normalization strips common Indian company suffixes before comparison so
-- "Sharma Transport" matches "Sharma Transport Pvt Ltd" (similarity ~0.72 raw,
-- ~0.91 normalized).
--
-- Phone bonus: when p_phone is provided and normalized to match an org's phone,
-- similarity_score gains +0.25 (capped at 1.0). Phone is a ranking signal only;
-- raw phone is never returned in the response shape.
--
-- Returns up to 5 results ordered by final_score descending.
--
-- TODO (future migration): add CHECK constraint or partial unique index on
--   organizations.phone to prevent duplicate phone entries. Currently multiple
--   orgs can share a phone number, which can cause identical phone bonuses on
--   multiple results (surfacing duplicates). Track as tech-debt before adding
--   phone-only auto-linking logic.
--
-- Rollback: DROP FUNCTION find_org_matches_for_counterparty(text, float, text);

CREATE OR REPLACE FUNCTION find_org_matches_for_counterparty(
  p_name          text,
  p_min_similarity float DEFAULT 0.55,
  p_phone         text  DEFAULT NULL
)
RETURNS TABLE (
  org_id           uuid,
  org_name         text,
  similarity_score float,
  org_city         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized_input AS (
    SELECT
      TRIM(
        REGEXP_REPLACE(
          LOWER(TRIM(p_name)),
          '\s+(pvt\.?\s*ltd\.?|private limited|llp|llc|and\b|&|co\.?)$',
          '',
          'i'
        )
      ) AS n,
      normalize_phone_number(p_phone) AS normalized_caller_phone
  ),
  scored AS (
    SELECT
      o.id                AS org_id,
      o.name              AS org_name,
      GREATEST(
        similarity(o.name, p_name),
        similarity(
          TRIM(REGEXP_REPLACE(LOWER(TRIM(o.name)), '\s+(pvt\.?\s*ltd\.?|private limited|llp|llc|and\b|&|co\.?)$', '', 'i')),
          (SELECT n FROM normalized_input)
        )
      )                   AS name_score,
      -- Phone bonus: +0.25 when normalized phones match.
      -- Only applies when caller supplied a phone AND the org has a phone.
      -- o.phone is NOT returned in the result — used for scoring only.
      CASE
        WHEN (SELECT normalized_caller_phone FROM normalized_input) IS NULL THEN 0.0
        WHEN normalize_phone_number(o.phone) IS NULL THEN 0.0
        WHEN normalize_phone_number(o.phone) = (SELECT normalized_caller_phone FROM normalized_input) THEN 0.25
        ELSE 0.0
      END                 AS phone_bonus,
      o.city              AS org_city
    FROM organizations o
    WHERE o.status = 'active'
      AND similarity(o.name, p_name) >= (p_min_similarity * 0.7)
  )
  SELECT
    org_id,
    org_name,
    -- Clamp final score to 1.0; phone_bonus can push a borderline match over the threshold
    LEAST(1.0, name_score + phone_bonus)::float AS similarity_score,
    org_city
  FROM scored
  WHERE name_score >= p_min_similarity
     OR (phone_bonus > 0 AND name_score >= (p_min_similarity * 0.6))
  ORDER BY (name_score + phone_bonus) DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION find_org_matches_for_counterparty(text, float, text) TO authenticated;
