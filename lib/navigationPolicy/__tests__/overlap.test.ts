import { isParameterizedPattern } from '@/lib/navigationPolicy/pathCanonicalize';
import { getRegistry } from '@/lib/navigationPolicy/registry';

/**
 * Same-priority exact (non-param) pattern collisions would make match order
 * unstable across merges — fail CI when detected.
 */
describe('registry overlap detection', () => {
  it('no two exact patterns share the same priority', () => {
    const registry = getRegistry();
    const buckets = new Map<string, string[]>();
    for (const p of registry) {
      if (isParameterizedPattern(p.pattern)) continue;
      const key = `${p.priority}::${p.pattern}`;
      const list = buckets.get(key) ?? [];
      list.push(p.id);
      buckets.set(key, list);
    }
    const collisions = [...buckets.entries()].filter(([, ids]) => ids.length > 1);
    expect(collisions).toEqual([]);
  });
});
