import type { FlowStep } from '@/lib/flowStep.types';

/**
 * Business sign-up · step 2 — OTP verification + onboarding resolver.
 * Source: useBusinessSignUpFlow.verifyOtp · OtpStep · mapDomainContextToUi
 */
export const businessSignUpStep02OtpVerify: FlowStep = {
  id: 'bu-otp',
  order: 2,
  label: 'Verify',
  title: 'Verification',
  subtitle: 'Confirm OTP · invitation resolver runs · routes owner vs team paths',
  route: '/sign-up',
  screen: 'OtpStep · BusinessSignUpScreen',
  service: 'verifyOtp → platformIdentityService',
  serviceCalls: [
    'checkExistingUserByPhone (re-fetch if stale)',
    'platformIdentityService.resolveInvitations',
    'platformIdentityService.resolveOnboardingContext',
    'platformIdentityService.recordIdentityVerified',
    'checkEmailRegisteredForSignup (when invite email candidate)',
    'setPendingInvitation (AsyncStorage)',
    'applyOnboardingContext → signupTrack + invitePhase',
  ],
  phase: 'ui',
  fields: ['6-digit OTP (OTP_LENGTH=6)', 'phone (from step 1, verified identity)'],
  reads: [
    'profiles (checkExistingUserByPhone — phone exists, masked email)',
    'RPC expire_stale_team_invitations',
    'RPC resolve_pending_team_invitations_by_phone',
    'organization_team_invites (via resolver RPC)',
    'auth.users email check (checkEmailRegisteredForSignup)',
  ],
  routing: [
    { context: 'owner', track: 'owner', nextScreen: 'OrgStep (step 3 wizard)' },
    { context: 'team', track: 'invite · accept', nextScreen: 'InviteAcceptanceStep' },
    { context: 'existing_member', track: 'invite · existing_account', nextScreen: 'InviteExistingAccountStep → /sign-in' },
    { context: 'multiple_invites', track: 'invite · picker', nextScreen: 'InvitePickerStep' },
    { context: 'no_invitation', track: 'invite · no_invite', nextScreen: 'InviteNotFoundStep (limited access)' },
    { context: 'expired_invites', track: 'invite · expired', nextScreen: 'Expired invites screen' },
  ],
  notes: [
    'Mock OTP: any 6 digits accepted — resolver failures do not block verify',
    'Entry hints: ?intent=team · /onboarding/join-team (entryIntent UX only)',
    'entryChannel from searchParams → analytics + recordIdentityVerified',
    'Owner path clears pending OAuth metadata after context applied',
    'No auth.users row yet — routing only; writes start at AccountStep signUp',
  ],
};
