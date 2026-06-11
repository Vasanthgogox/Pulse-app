import {
  formatEntryDisplay,
  formatINRDisplay,
  formatTriggerDisplay,
} from '../formatters';

describe('formatEntryDisplay', () => {
  it('formats Indian locale grouping without corrupting digits', () => {
    expect(formatEntryDisplay('78000')).toBe('78,000');
    expect(formatEntryDisplay('99999999')).toBe('9,99,99,999');
    expect(formatEntryDisplay('1000')).toBe('1,000');
  });

  it('preserves trailing decimal dot during entry', () => {
    expect(formatEntryDisplay('78000.')).toBe('78,000.');
    expect(formatEntryDisplay('78.5')).toBe('78.5');
  });

  it('returns empty for empty raw', () => {
    expect(formatEntryDisplay('')).toBe('');
  });
});

describe('formatTriggerDisplay', () => {
  it('formats stored values for trigger chips', () => {
    expect(formatTriggerDisplay('78000')).toBe('78,000');
    expect(formatTriggerDisplay(78000)).toBe('78,000');
  });

  it('treats zero and empty as blank', () => {
    expect(formatTriggerDisplay(0)).toBe('');
    expect(formatTriggerDisplay('')).toBe('');
    expect(formatTriggerDisplay(null)).toBe('');
  });
});

describe('formatINRDisplay', () => {
  it('includes rupee symbol with spaced grouping', () => {
    expect(formatINRDisplay(78000)).toBe('₹ 78,000');
  });
});
