/**
 * Authentication — proving who you are (OTP, password, IdP).
 * Distinct from Identity — who you are within Pulse after verification.
 */

export type AuthenticationMethod =
  | 'phone_otp'
  | 'email_magic_link'
  | 'email_otp'
  | 'password'
  | 'google'
  | 'microsoft_entra'
  | 'okta'
  | 'auth0'
  | 'saml'
  | 'oidc';

export type AuthenticationResult = {
  success: boolean;
  method: AuthenticationMethod;
  error?: Error | null;
  /** Populated on success — feeds Platform Identity resolution. */
  verifiedIdentities?: import('@/lib/onboarding/identityTypes').InvitationIdentity[];
};

/**
 * Authentication answers: "Can you prove who you are?"
 * Identity answers: "Who are you within Pulse?"
 */
export type AuthenticationSession = {
  method: AuthenticationMethod;
  verifiedAt: string;
  personId?: string | null;
};
