import type { TrustIndicatorId } from '../components/OnboardingTrustBar';

export function businessActivationTrust(step: number): {
  active: TrustIndicatorId;
  completed: TrustIndicatorId[];
} {
  if (step <= 1) {
    return { active: 'identity', completed: [] };
  }
  if (step <= 5) {
    return { active: 'workspace', completed: ['identity'] };
  }
  return { active: 'verification', completed: ['identity', 'workspace'] };
}

export function driverActivationTrust(step: number): {
  active: TrustIndicatorId;
  completed: TrustIndicatorId[];
} {
  if (step <= 2) {
    return { active: 'identity', completed: [] };
  }
  if (step <= 6) {
    return { active: 'compliance', completed: ['identity'] };
  }
  return { active: 'verification', completed: ['identity', 'compliance'] };
}
