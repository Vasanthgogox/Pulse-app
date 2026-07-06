/**
 * Onboarding funnel analytics — dev console today; wire to product analytics later.
 */
import type { OnboardingContextType } from '@/lib/onboarding/onboardingContext';
import type { SignupEntryIntent } from '@/features/auth/signup/signupEntryIntent';

export type OnboardingAnalyticsEvent =
  | 'join_company_started'
  | 'owner_signup_started'
  | 'otp_verified'
  | 'invitation_found'
  | 'multiple_invitations'
  | 'invitation_accepted'
  | 'invitation_accept_failed'
  | 'no_invitation'
  | 'existing_account'
  | 'existing_account_signed_in'
  | 'owner_signup'
  | 'invitation_expired';

export type OnboardingAnalyticsPayload = {
  entryHint?: SignupEntryIntent;
  onboardingType?: OnboardingContextType;
  inviteId?: string | null;
  inviteCount?: number;
  phoneAccountExists?: boolean;
  source?: string;
};

const ANALYTICS_PREFIX = '[onboarding]';

export function trackOnboardingEvent(
  event: OnboardingAnalyticsEvent,
  payload?: OnboardingAnalyticsPayload,
): void {
  if (__DEV__) {
    console.info(ANALYTICS_PREFIX, event, payload ?? {});
  }
  // Future: analytics.identify / track(event, payload)
}
