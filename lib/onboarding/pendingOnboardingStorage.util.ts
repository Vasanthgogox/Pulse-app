import AsyncStorage from '@react-native-async-storage/async-storage';

import type { InvitationResolverResult, ResolvedTeamInvitation } from '@/features/organization/services/teamInvitationResolver.service';
import type { InvitePhase } from '@/features/auth/signup/signupInviteTypes';

const STORAGE_KEY = '@pulse_pending_onboarding_v1';

export type PendingMemberInvitation = {
  version: 1;
  phone: string;
  inviteId: string | null;
  invitation: ResolvedTeamInvitation | null;
  resolved: InvitationResolverResult;
  phase: InvitePhase;
  savedAt: string;
};

export async function loadPendingMemberInvitation(): Promise<PendingMemberInvitation | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingMemberInvitation;
    if (parsed?.version !== 1 || typeof parsed.phone !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function savePendingMemberInvitation(
  payload: PendingMemberInvitation,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal — in-memory context still holds state for the session.
  }
}

export async function clearPendingMemberInvitation(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
