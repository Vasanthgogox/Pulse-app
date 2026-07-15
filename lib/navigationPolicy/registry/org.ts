import type { PolicyRecord } from '@/lib/navigationPolicy/types';

/** Phase 1 placeholders — org experience. Full coverage in Phase 2. */
export const ORG_POLICIES: readonly PolicyRecord[] = [
  {
    id: 'org.trips',
    pattern: '/trips',
    experience: 'org',
    grants: { anyOf: ['dispatch', 'dispatch_for_own_fleet'] },
    priority: 100,
    onDeny: { type: 'sign_in' },
  },
  {
    id: 'org.finance',
    pattern: '/finance',
    experience: 'org',
    grants: { anyOf: ['finance_view', 'finance_manage'] },
    priority: 100,
    onDeny: { type: 'path', path: '/trips' },
  },
  {
    id: 'org.workspace',
    pattern: '/workspace',
    experience: 'org',
    priority: 100,
    onDeny: { type: 'sign_in' },
  },
  {
    id: 'org.trip-detail',
    pattern: '/trip/:id',
    experience: 'org',
    grants: { anyOf: ['dispatch', 'dispatch_for_own_fleet', 'finance_view'] },
    priority: 80,
    onDeny: { type: 'sign_in' },
  },
];
