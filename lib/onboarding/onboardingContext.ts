/**
 * Post-OTP onboarding context — client of platformIdentityService.
 */
import { platformIdentityService } from '@/lib/platform-identity';

import type { OnboardingContextInput } from './onboardingContextInput';
import {
  onboardingContextAnalyticsEvent,
  onboardingContextToUi,
  type ResolvedOnboardingContext,
} from './mapDomainContextToUi';

export type { OnboardingContextInput } from './onboardingContextInput';
export type {
  OnboardingContextType,
  ResolvedOnboardingContext,
} from './mapDomainContextToUi';
export { onboardingContextAnalyticsEvent, onboardingContextToUi };

export async function resolveOnboardingContext(
  input: OnboardingContextInput,
): Promise<ResolvedOnboardingContext> {
  return platformIdentityService.resolveOnboardingContext(input);
}
