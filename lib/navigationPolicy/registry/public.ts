import type { PolicyRecord } from '@/lib/navigationPolicy/types';

/** Phase 1 placeholders — public content / process. Full coverage in Phase 2. */
export const PUBLIC_POLICIES: readonly PolicyRecord[] = [
  {
    id: 'public.terminal-website',
    pattern: '/terminal-website',
    experience: 'public_content',
    priority: 100,
  },
  {
    id: 'public.sign-in',
    pattern: '/sign-in',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.sign-up',
    pattern: '/sign-up',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.forgot-password',
    pattern: '/forgot-password',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.auth-callback',
    pattern: '/auth/callback',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.auth-reset-password',
    pattern: '/auth/reset-password',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.public-profile',
    pattern: '/public-profile/:type/:id',
    experience: 'public_content',
    priority: 80,
  },
  {
    id: 'public.root-boot',
    pattern: '/',
    experience: 'public_content',
    priority: 50,
    onDeny: { type: 'sign_in' },
  },
];
