import {
  applyKeypadPress,
  formatDisplayValue,
  isKeypadValueSubmittable,
  parseRawToNumber,
  rawToSubmitValue,
  toRawString,
} from '../keypad';

describe('applyKeypadPress', () => {
  it('builds integer values digit by digit', () => {
    let raw = '';
    for (const digit of '78000') {
      raw = applyKeypadPress(raw, digit as '7' | '8' | '0');
    }
    expect(raw).toBe('78000');
  });

  it('handles backspace repeatedly until empty', () => {
    let raw = '78000';
    while (raw.length > 0) {
      raw = applyKeypadPress(raw, '⌫');
    }
    expect(raw).toBe('');
  });

  it('replaces leading zero when typing a non-zero digit', () => {
    expect(applyKeypadPress('0', '5')).toBe('5');
  });

  it('allows decimal entry and preserves trailing dot in raw state', () => {
    expect(applyKeypadPress('78', '.')).toBe('78.');
    expect(applyKeypadPress('78.', '5')).toBe('78.5');
  });

  it('blocks duplicate decimal points', () => {
    expect(applyKeypadPress('78.5', '.')).toBe('78.5');
  });

  it('respects max decimal places', () => {
    expect(applyKeypadPress('1.23', '4', { maxDecimalPlaces: 2 })).toBe('1.23');
  });

  it('respects max integer digits', () => {
    const nine = '123456789';
    expect(applyKeypadPress(nine, '0', { maxIntDigits: 9 })).toBe(nine);
  });
});

describe('formatDisplayValue', () => {
  const cases: Array<[string, string]> = [
    ['1', '1'],
    ['10', '10'],
    ['100', '100'],
    ['1000', '1,000'],
    ['10000', '10,000'],
    ['78000', '78,000'],
    ['99999999', '9,99,99,999'],
    ['0', '0'],
    ['', ''],
    ['78000.', '78,000.'],
    ['78.5', '78.5'],
    ['78.50', '78.50'],
  ];

  it.each(cases)('formats raw %j as %j', (raw, expected) => {
    expect(formatDisplayValue(raw)).toBe(expected);
  });
});

describe('toRawString', () => {
  it('normalises formatted and zero values', () => {
    expect(toRawString('78,000')).toBe('78000');
    expect(toRawString(0)).toBe('');
    expect(toRawString('')).toBe('');
    expect(toRawString(null)).toBe('');
  });
});

describe('parseRawToNumber', () => {
  it('parses raw strings safely', () => {
    expect(parseRawToNumber('78000')).toBe(78000);
    expect(parseRawToNumber('')).toBe(0);
    expect(parseRawToNumber('78.')).toBe(78);
  });
});

describe('rawToSubmitValue', () => {
  it('strips trailing dot and normalises empty to zero', () => {
    expect(rawToSubmitValue('78000.')).toBe('78000');
    expect(rawToSubmitValue('')).toBe('0');
    expect(rawToSubmitValue('78.5')).toBe('78.5');
  });
});

describe('isKeypadValueSubmittable', () => {
  it('accepts positive values only', () => {
    expect(isKeypadValueSubmittable('78000')).toBe(true);
    expect(isKeypadValueSubmittable('0')).toBe(false);
    expect(isKeypadValueSubmittable('')).toBe(false);
    expect(isKeypadValueSubmittable('.')).toBe(false);
  });
});

describe('keypad typing simulation', () => {
  const typeDigits = (digits: string) => {
    let raw = '';
    for (const char of digits) {
      if (char === '.') {
        raw = applyKeypadPress(raw, '.');
      } else if (char === '⌫') {
        raw = applyKeypadPress(raw, '⌫');
      } else {
        raw = applyKeypadPress(raw, char as '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9');
      }
    }
    return raw;
  };

  it('78000 entry produces correct display and submit payload', () => {
    const raw = typeDigits('78000');
    expect(raw).toBe('78000');
    expect(formatDisplayValue(raw)).toBe('78,000');
    expect(rawToSubmitValue(raw)).toBe('78000');
    expect(parseRawToNumber(raw)).toBe(78000);
  });

  it('fast typing then delete-all leaves empty raw', () => {
    let raw = typeDigits('99999999');
    expect(formatDisplayValue(raw)).toBe('9,99,99,999');
    raw = typeDigits('⌫'.repeat(raw.length));
    expect(raw).toBe('');
    expect(formatDisplayValue(raw)).toBe('');
  });
});
