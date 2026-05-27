/**
 * Pure string-based keypad utilities. No parseFloat on money — all operations
 * are done on the raw digit string to avoid IEEE-754 precision issues.
 */

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '⌫';

const MAX_INT_DIGITS = 9;   // 999,999,999 — covers crore range
const MAX_DECIMAL_PLACES = 2;

/**
 * Apply a single keypad key press to the current raw string.
 * Returns the new raw string (no formatting, just digits + optional dot).
 */
export function applyKeypadPress(current: string, key: KeypadKey): string {
  if (key === '⌫') {
    return current.slice(0, -1);
  }

  if (key === '.') {
    if (current.includes('.')) return current;
    if (!current || current === '0') return '0.';
    return current + '.';
  }

  // Digit key
  const dotIdx = current.indexOf('.');
  if (dotIdx !== -1) {
    // Appending to decimal part
    const decLen = current.length - dotIdx - 1;
    if (decLen >= MAX_DECIMAL_PLACES) return current;
    return current + key;
  }

  // Integer part
  if (current === '0' && key !== '0') return key;   // replace leading zero
  if (current === '0' && key === '0') return current; // no double-zero
  if (current.length >= MAX_INT_DIGITS) return current;
  return current + key;
}

/**
 * Format a raw digit string (e.g. "45000.5") for display using Indian locale.
 * Preserves a trailing dot so users can see they started typing decimals.
 */
export function formatDisplayValue(
  raw: string,
  _type: 'currency' | 'numeric' | 'percentage' = 'currency',
): string {
  if (!raw) return '';
  const hasDot = raw.includes('.');
  const [intStr, decStr] = raw.split('.');

  const intNum = parseInt(intStr || '0', 10);
  const formattedInt = isNaN(intNum)
    ? '0'
    : intNum.toLocaleString('en-IN');

  if (hasDot) {
    return `${formattedInt}.${decStr ?? ''}`;
  }
  return formattedInt;
}

/**
 * Normalise any incoming value prop (number | string | undefined) to a raw
 * digit string suitable as `initialValue` for `FullscreenNumericEntry`.
 */
export function toRawString(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const str = String(value).replace(/,/g, '').trim();
  if (str === '0' || str === '0.00' || str === '0.0') return '';
  return str;
}

/**
 * Parse raw digit string to a JS number for passing to onChange handlers.
 * Safe wrapper — never returns NaN (falls back to 0).
 */
export function parseRawToNumber(raw: string): number {
  if (!raw || raw === '.' || raw === '0.') return 0;
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

/**
 * Prepare raw string for DB submission: strip trailing dot, default to '0'.
 */
export function rawToSubmitValue(raw: string): string {
  if (!raw) return '0';
  const trimmed = raw.endsWith('.') ? raw.slice(0, -1) : raw;
  return trimmed || '0';
}
