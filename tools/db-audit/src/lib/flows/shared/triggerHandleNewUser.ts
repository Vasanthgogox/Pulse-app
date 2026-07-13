import type { FlowStep } from '@/lib/flowStep.types';

export const triggerHandleNewUser: FlowStep = {
  id: 'trigger-handle-new-user',
  order: 0,
  label: 'Trigger',
  title: 'handle_new_user',
  subtitle: 'AFTER INSERT on auth.users',
  route: 'DB trigger',
  screen: 'supabase/migrations · handle_new_user()',
  phase: 'trigger',
  tables: ['public.users', 'public.profiles', 'public.organizations?', 'public.organization_members?'],
  notes: [
    'Org only when role=user AND onboarding_type=owner',
    'Member signup skips org — join via acceptInvitation',
    'Driver: profile only, aggregated/asset false',
  ],
};
