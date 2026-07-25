// Auto-generated Phase 2 registry — public content & process
import type { PolicyRecord } from '@/lib/navigationPolicy/types';

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
    id: 'public.driver-sign-in',
    pattern: '/driver-sign-in',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.welcome',
    pattern: '/welcome',
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
    id: 'public.driver-signup',
    pattern: '/driver-signup',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.onboarding',
    pattern: '/onboarding',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.onboarding-business',
    pattern: '/onboarding/business',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.onboarding-driver',
    pattern: '/onboarding/driver',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.onboarding-join-team',
    pattern: '/onboarding/join-team',
    experience: 'public_process',
    priority: 100,
  },
  {
    id: 'public.public-profile',
    pattern: '/public-profile/:type/:id',
    experience: 'public_content',
    priority: 90,
  },
  {
    id: 'public.referral-landing',
    pattern: '/r/:code',
    experience: 'public_content',
    priority: 90,
  },
  {
    id: 'public.not-found',
    pattern: '/+not-found',
    experience: 'public_content',
    priority: 100,
  },
  {
    id: 'public.root-boot',
    pattern: '/',
    experience: 'public_content',
    priority: 40,
    onDeny: { type: 'sign_in' },
  },
];
