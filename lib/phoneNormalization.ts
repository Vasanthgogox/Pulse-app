/**
 * Phone number normalization for matching/comparison purposes.
 *
 * This is intentionally separate from lib/phoneValidation.ts, which validates
 * form input. This module normalizes raw phone strings into a canonical E.164-like
 * format so that "98765 43210", "+91-9876543210", and "09876543210" all compare
 * as equal.
 *
 * Design constraints:
 * - No external libraries (no libphonenumber-js)
 * - Indian-first: defaults to +91 country code
 * - Returns null for anything that cannot be confidently normalized
 * - Phone is a ranking signal for matching, NOT an identity proof
 */

const DEFAULT_COUNTRY_CODE = "+91";
const INDIA_CC_DIGITS = "91";

/** Chars to strip before analysis (everything except digits and leading +). */
const STRIP_RE = /[\s\-().]/g;

/** Reject obviously non-numeric or suspiciously short results. */
const MIN_DIGIT_LENGTH = 8;

/**
 * Normalizes a raw phone string to canonical E.164-like format.
 *
 * Rules applied in order:
 * 1. Trim whitespace.
 * 2. Strip spaces, dashes, parentheses, dots.
 * 3. Extract digit sequence; preserve leading + if present.
 * 4. Leading 0 + 10 digits (Indian local) → +91{10 digits}.
 * 5. Plain 10 digits with no prefix → +91{10 digits}.
 * 6. 11 digits starting with "91" (no +) → +91{10 digits}.
 * 7. Already starts with "+": preserve, clean up non-digits after +.
 * 8. Reject if fewer than MIN_DIGIT_LENGTH digits remain.
 * 9. Return null for empty/invalid input.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountryCode = DEFAULT_COUNTRY_CODE,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const hasLeadingPlus = trimmed.startsWith("+");

  // Strip formatting chars
  const cleaned = trimmed.replace(STRIP_RE, "");

  // Extract digits only (after stripping, the only non-digit would be a leading + which we've captured)
  const digits = cleaned.replace(/\D/g, "");

  if (digits.length < MIN_DIGIT_LENGTH) return null;

  // Reject strings that are clearly not numeric (e.g. "abc123")
  // — more than half non-digit characters is suspicious
  if (digits.length < trimmed.replace(/[\s\-().+]/g, "").length / 2) {
    return null;
  }

  // Rule 4: 0XXXXXXXXXX (leading zero + 10 digits) → +91 10 digits
  if (!hasLeadingPlus && digits.length === 11 && digits.startsWith("0")) {
    const national = digits.slice(1);
    return `${defaultCountryCode}${national}`;
  }

  // Rule 6: 91XXXXXXXXXX (11 digits, no +, starts with 91) → +91 10 digits
  if (!hasLeadingPlus && digits.length === 12 && digits.startsWith(INDIA_CC_DIGITS)) {
    const national = digits.slice(2);
    return `${defaultCountryCode}${national}`;
  }

  // Rule 5: Bare 10 digits → +91 10 digits (Indian default)
  if (!hasLeadingPlus && digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }

  // Rule 7: Has leading + — rebuild as +{digits}
  if (hasLeadingPlus) {
    const withPlus = `+${digits}`;
    // Sanity: E.164 is max 15 digits including country code
    if (digits.length > 15) return null;
    return withPlus;
  }

  // Anything else we can't confidently classify — return null
  return null;
}

/**
 * Returns true if two phone strings normalize to the same canonical value.
 * Safely handles null / undefined on either side.
 *
 * IMPORTANT: A true result means the phones look equivalent. It does NOT mean
 * the entities are the same organization — phone is a ranking signal, not an
 * identity proof.
 */
export function arePhonesEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (na === null || nb === null) return false;
  return na === nb;
}

/*
 * ── Usage examples (uncomment to run in a scratch file) ───────────────────
 *
 * normalizePhone('+91 9876543210')     → '+919876543210'
 * normalizePhone('+91-98765-43210')    → '+919876543210'
 * normalizePhone('98765 43210')        → '+919876543210'
 * normalizePhone('9876543210')         → '+919876543210'
 * normalizePhone('09876543210')        → '+919876543210'
 * normalizePhone('91-9876543210')      → '+919876543210'
 * normalizePhone('(+91)9876543210')    → '+919876543210'
 * normalizePhone('+91 (98765) 43210')  → '+919876543210'
 *
 * normalizePhone('abc123')             → null  (non-numeric)
 * normalizePhone('1234')               → null  (< 8 digits)
 * normalizePhone('++919876543210')     → null  (double plus: stripped to digits,
 *                                               becomes 12 digits with no leading +
 *                                               → treated as 91XXXXXXXXXX → '+919876543210'
 *                                               actually — let's trace: trimmed='++919876543210',
 *                                               hasLeadingPlus=true, cleaned='++919876543210',
 *                                               digits='919876543210' (12), withPlus='+919876543210' ✓)
 * normalizePhone(null)                 → null
 * normalizePhone(undefined)            → null
 * normalizePhone('')                   → null
 *
 * arePhonesEquivalent('+91 9876543210', '09876543210')  → true
 * arePhonesEquivalent('+91 9876543210', null)           → false
 * ─────────────────────────────────────────────────────────────────────────
 */
