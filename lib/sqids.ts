/**
 * Sqids helpers for opaque business references.
 *
 * `decodeId` is for server/scripts only — do not import it from client UI components.
 * DB triggers use the same alphabet stored in `app_config.sqids_alphabet`.
 */
import Sqids from 'sqids';

/** Shuffled a-z0-9 — must match `app_config.sqids_alphabet` in Postgres. */
export const DEFAULT_SQIDS_ALPHABET =
  'h4n0kxr7m2qj5w9v3p6f1tz8cbdysgauileo';

const MIN_LENGTH = 6;

function resolveAlphabet(): string {
  const raw =
    (typeof process !== 'undefined' && process.env?.SQIDS_ALPHABET) ||
    DEFAULT_SQIDS_ALPHABET;
  const alphabet = String(raw).trim();
  if (alphabet.length < 3) {
    throw new Error('SQIDS_ALPHABET must have at least 3 unique characters');
  }
  return alphabet;
}

let _instance: Sqids | null = null;

function getSqids(): Sqids {
  if (!_instance) {
    _instance = new Sqids({
      alphabet: resolveAlphabet(),
      minLength: MIN_LENGTH,
    });
  }
  return _instance;
}

/** Encode a non-negative integer to an opaque string (min length 6). */
export function encodeId(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    throw new RangeError('encodeId expects a non-negative finite number');
  }
  return getSqids().encode([Math.floor(n)]);
}

/** Decode an opaque string back to its integer. Server/scripts only. */
export function decodeId(s: string): number {
  const decoded = getSqids().decode(String(s ?? '').trim());
  if (decoded.length !== 1) {
    throw new RangeError(`decodeId: invalid sqid "${s}"`);
  }
  return decoded[0]!;
}

export function encodeBookingRef(n: number): string {
  return `BKG-${encodeId(n)}`;
}

export function encodeTripCode(orgCode: string, n: number): string {
  const code = String(orgCode ?? '').trim().toUpperCase();
  if (!code) throw new Error('encodeTripCode: orgCode is required');
  return `${code}-TRP-${encodeId(n)}`;
}

export function encodeIndentCode(orgCode: string, n: number): string {
  const code = String(orgCode ?? '').trim().toUpperCase();
  if (!code) throw new Error('encodeIndentCode: orgCode is required');
  return `${code}-IND-${encodeId(n)}`;
}

/** @internal Reset singleton (tests). */
export function __resetSqidsForTests(): void {
  _instance = null;
}
