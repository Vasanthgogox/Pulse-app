import type { FlowStep } from '@/lib/flowStep.types';
import { AUTH_UID, HANDLE_NEW_USER_TRIGGER } from '@/lib/flows/shared/sqlSnippets';

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
  queries: [
    {
      label: 'Owner path (role=user, onboarding_type=owner)',
      when: 'Email signUp or OAuth INSERT with owner metadata',
      sql: `${HANDLE_NEW_USER_TRIGGER}`,
    },
    {
      label: 'Member path (onboarding_type=member)',
      when: 'Team signUp',
      sql: `-- INSERT public.users + public.profiles only
-- SKIP organizations + organization_members`,
    },
    {
      label: 'Driver path (role=driver)',
      when: 'driver establishLink signUp',
      sql: `INSERT INTO public.profiles (..., aggregated, asset)
VALUES (..., false, false);
-- No organizations`,
    },
    {
      label: 'Metadata source',
      when: 'Trigger reads NEW.raw_user_meta_data',
      sql: `SELECT
  NEW.raw_user_meta_data->>'role',
  NEW.raw_user_meta_data->>'onboarding_type',
  NEW.raw_user_meta_data->>'company_name',
  NEW.raw_user_meta_data->>'phone'
FROM auth.users WHERE id = ${AUTH_UID};`,
    },
  ],
  notes: [
    'Org only when role=user AND onboarding_type=owner',
    'Member signup skips org — join via acceptInvitation',
    'Driver: profile only, aggregated/asset false',
    'Google OAuth may INSERT before metadata patch — org UPDATE client-side after',
  ],
};
