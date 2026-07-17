import type { OrganizationState } from '@/types/onboarding';
import { EMPTY_ORGANIZATION } from '@/types/onboarding';

/** Onboarding wizard state only — master data lives in platform services. */
const ONBOARDING_STORAGE_KEY = 'pulse-commerce-onboarding-v1';

type PersistedOnboarding = Pick<OrganizationState, 'onboardingStep' | 'onboardingDone'>;

export function loadOnboardingState(): PersistedOnboarding {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) {
      return {
        onboardingStep: EMPTY_ORGANIZATION.onboardingStep,
        onboardingDone: EMPTY_ORGANIZATION.onboardingDone,
      };
    }
    const parsed = JSON.parse(raw) as PersistedOnboarding;
    return {
      onboardingStep: parsed.onboardingStep ?? EMPTY_ORGANIZATION.onboardingStep,
      onboardingDone: Boolean(parsed.onboardingDone),
    };
  } catch {
    return {
      onboardingStep: EMPTY_ORGANIZATION.onboardingStep,
      onboardingDone: EMPTY_ORGANIZATION.onboardingDone,
    };
  }
}

export function saveOnboardingState(state: PersistedOnboarding): void {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
}

/** @deprecated Master data is platform-owned — use platform services. */
export function loadOrganizationState(): OrganizationState {
  const onboarding = loadOnboardingState();
  return { ...EMPTY_ORGANIZATION, ...onboarding };
}

/** @deprecated Persists onboarding wizard flags only. */
export function saveOrganizationState(state: OrganizationState): void {
  saveOnboardingState({
    onboardingStep: state.onboardingStep,
    onboardingDone: state.onboardingDone,
  });
}

export function resetOrganizationState(): void {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}
