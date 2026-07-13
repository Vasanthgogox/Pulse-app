import type { FlowStep } from '@/lib/flowStep.types';
import {
  RPC_ACCEPT_TEAM_INVITE,
  RPC_RESOLVE_TEAM_INVITES,
  SIGNUP_AUTH_INSERT,
} from '@/lib/flows/shared/sqlSnippets';

export const TEAM_NEW_SIGNUP_STEPS: FlowStep[] = [
  {
    id: 'bu-team-invite',
    order: 3,
    label: 'Invite',
    title: 'Accept invitation',
    subtitle: 'Picker or single active invite',
    route: '/sign-up · ?intent=team',
    screen: 'InviteAcceptanceStep · InvitePickerStep',
    phase: 'ui',
    reads: ['organization_team_invites (from step 2 resolver)'],
    queries: [
      {
        label: 'Already resolved at OTP step',
        when: 'step02 resolve_pending_team_invitations_by_phone',
        sql: RPC_RESOLVE_TEAM_INVITES,
      },
    ],
    notes: ['Skips org wizard — UI picks inviteId', 'AsyncStorage setPendingInvitation'],
  },
  {
    id: 'bu-team-account',
    order: 4,
    label: 'Account',
    title: 'Create account',
    subtitle: 'Minimal credentials for new member',
    route: '/sign-up',
    screen: 'AccountStep · acceptTeamInvitation',
    service: 'auth.service signUp',
    serviceCalls: ['checkEmailRegisteredForSignup', 'signUp(onboarding_type=member)'],
    phase: 'auth',
    fields: ['full_name', 'email', 'password', 'phone'],
    authMetadata: ['role=user', 'onboarding_type=member', 'operating_model=HYBRID', 'phone'],
    tables: ['auth.users', 'public.users', 'public.profiles'],
    queries: [
      {
        label: '1) auth.users INSERT (member)',
        when: 'acceptTeamInvitation → signUp',
        sql: `${SIGNUP_AUTH_INSERT}
-- onboarding_type=member → trigger skips org INSERT`,
      },
      {
        label: '2) handle_new_user (profile only)',
        when: 'AFTER INSERT — no organizations row',
        sql: `-- INSERT public.users + public.profiles only
-- onboarding_type=member → skip org block in handle_new_user`,
      },
    ],
    notes: ['No organizations row on signup — join step 5'],
  },
  {
    id: 'bu-team-join',
    order: 5,
    label: 'Join',
    title: 'Accept into workspace',
    subtitle: 'Creates organization_members',
    route: '/sign-up',
    screen: 'useCompleteInvitationJoin',
    service: 'acceptPendingTeamInvitation RPC',
    phase: 'join',
    tables: ['organization_members', 'organization_team_invites'],
    queries: [
      {
        label: 'Accept invitation',
        when: 'completeInvitationJoin after session',
        sql: RPC_ACCEPT_TEAM_INVITE,
      },
    ],
    notes: ['router.replace(ROUTES.TABS.TRIPS) on success'],
  },
];

export const TEAM_EXISTING_SIGNUP_STEPS: FlowStep[] = [
  {
    id: 'bu-existing-invite',
    order: 3,
    label: 'Invite',
    title: 'Invitation context',
    subtitle: 'Phone matched to pending invite',
    route: '/sign-up',
    screen: 'InviteExistingAccountStep',
    phase: 'ui',
    reads: ['Resolved invite from OTP step'],
    queries: [
      {
        label: 'Read-only context',
        when: 'From step02 invite resolver',
        sql: `-- UI shows organization_name, invitee from resolver result
-- No write`,
      },
    ],
  },
  {
    id: 'bu-existing-signin',
    order: 4,
    label: 'Sign in',
    title: 'Existing account',
    subtitle: 'No new auth.users row',
    route: '/sign-in',
    screen: 'signInToAcceptInvitation',
    service: 'auth.service signIn',
    phase: 'auth',
    fields: ['email', 'password'],
    queries: [
      {
        label: 'Session only',
        when: 'signIn — existing user',
        sql: `-- supabase.auth.signInWithPassword({ email, password })
-- No INSERT; reads auth.users + profiles via session restore`,
      },
    ],
    notes: ['Uses existing profile — no signUp'],
  },
  {
    id: 'bu-existing-join',
    order: 5,
    label: 'Join',
    title: 'Accept invitation',
    subtitle: 'Link user to org membership',
    service: 'completeTeamJoinAfterAuth → acceptPendingTeamInvitation',
    phase: 'join',
    tables: ['organization_members', 'organization_team_invites'],
    queries: [
      {
        label: 'Accept invitation',
        when: 'After sign-in session exists',
        sql: RPC_ACCEPT_TEAM_INVITE,
      },
    ],
  },
];
