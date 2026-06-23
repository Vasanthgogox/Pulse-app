import {
  __resetSqidsForTests,
  DEFAULT_SQIDS_ALPHABET,
  decodeId,
  encodeBookingRef,
  encodeId,
  encodeIndentCode,
  encodeTripCode,
} from '@/lib/sqids';

describe('sqids', () => {
  beforeEach(() => {
    __resetSqidsForTests();
    process.env.SQIDS_ALPHABET = DEFAULT_SQIDS_ALPHABET;
  });

  afterEach(() => {
    delete process.env.SQIDS_ALPHABET;
    __resetSqidsForTests();
  });

  it('encodeId(42) round-trips and is not purely numeric', () => {
    const encoded = encodeId(42);
    expect(encoded.length).toBeGreaterThanOrEqual(6);
    expect(/^\d+$/.test(encoded)).toBe(false);
    expect(decodeId(encoded)).toBe(42);
  });

  it('encodeBookingRef prefixes BKG-', () => {
    const ref = encodeBookingRef(42);
    expect(ref.startsWith('BKG-')).toBe(true);
    expect(ref.length).toBeGreaterThan('BKG-'.length);
  });

  it('encodeTripCode and encodeIndentCode use org prefix', () => {
    expect(encodeTripCode('nihas', 1)).toMatch(/^NIHAS-TRP-/);
    expect(encodeIndentCode('nihas', 1)).toMatch(/^NIHAS-IND-/);
  });

  it('decodeId throws on invalid input', () => {
    expect(() => decodeId('!!!')).toThrow();
  });
});
