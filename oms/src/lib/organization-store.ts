import type { OrganizationState } from '@/types/onboarding';
import { EMPTY_ORGANIZATION } from '@/types/onboarding';

const STORAGE_KEY = 'pulse-org-state-v1';

export function loadOrganizationState(): OrganizationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_ORGANIZATION };
    return { ...EMPTY_ORGANIZATION, ...JSON.parse(raw) } as OrganizationState;
  } catch {
    return { ...EMPTY_ORGANIZATION };
  }
}

export function saveOrganizationState(state: OrganizationState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetOrganizationState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
