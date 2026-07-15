import type { PolicyRecord } from '@/lib/navigationPolicy/types';

/** Phase 1 placeholders — driver experience. Paths keep `(driver)` group (RFC §4.7). */
export const DRIVER_POLICIES: readonly PolicyRecord[] = [
  {
    id: 'driver.home',
    pattern: '/(driver)',
    experience: 'driver',
    priority: 100,
    onDeny: { type: 'experience_home', experience: 'driver' },
  },
  {
    id: 'driver.wallet',
    pattern: '/(driver)/wallet',
    experience: 'driver',
    priority: 90,
    onDeny: { type: 'experience_home', experience: 'driver' },
  },
];
