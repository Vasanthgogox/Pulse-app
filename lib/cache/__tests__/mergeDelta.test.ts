import { mergeDeltaRows } from '@/lib/cache/mergeDelta';

describe('mergeDeltaRows', () => {
  it('upserts changed rows and removes deleted ids', () => {
    const existing = [
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
    ];
    const changed = [
      { id: '2', name: 'B2' },
      { id: '3', name: 'C' },
    ];
    const deletedIds = ['1'];

    const result = mergeDeltaRows({ existing, changed, deletedIds });
    expect(result).toEqual([
      { id: '2', name: 'B2' },
      { id: '3', name: 'C' },
    ]);
  });
});
