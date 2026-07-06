/**
 * How the user entered onboarding (UX / analytics only — not authorization).
 */
export type OnboardingEntryChannel =
  | 'hub_join_company'
  | 'hub_transport_business'
  | 'email_invite'
  | 'sms_invite'
  | 'qr_invite'
  | 'deep_link'
  | 'sso' // future
  | 'corporate_directory'; // future

export type IdentityVerificationMethod =
  | 'phone_otp'
  | 'email_magic_link'
  | 'email_otp'
  | 'password'
  | 'google'
  | 'microsoft_entra'
  | 'okta'
  | 'saml'
  | 'oidc';

/** Map URL ref / invite params to entry channel (presentation + analytics). */
export function entryChannelFromParams(params: {
  intent?: unknown;
  invite?: unknown;
  ref?: unknown;
}): OnboardingEntryChannel | undefined {
  const ref = typeof params.ref === 'string' ? params.ref : undefined;
  const invite = typeof params.invite === 'string' ? params.invite : undefined;

  if (ref === 'sms-invite' || invite === 'sms') return 'sms_invite';
  if (ref === 'email-invite' || invite === 'email') return 'email_invite';
  if (ref === 'qr-invite' || invite === 'qr') return 'qr_invite';
  if (ref === 'team-invite' || params.intent === 'team') return 'hub_join_company';
  if (invite != null || ref != null) return 'deep_link';
  if (params.intent !== 'team') return 'hub_transport_business';
  return 'hub_join_company';
}
