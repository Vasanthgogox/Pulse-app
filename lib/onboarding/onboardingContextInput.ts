import type { SignupEntryIntent } from '@/features/auth/signup/signupEntryIntent';
import type { InvitationResolverResult } from '@/features/organization/services/teamInvitationResolver.service';

import type { OnboardingEntryChannel } from './onboardingEntryChannels';
import type { InvitationIdentity } from './identityTypes';

export type OnboardingContextInput = {
  /** UX-only hint when resolver finds zero invitations (team vs owner default). */
  entryHint: SignupEntryIntent;
  entryChannel?: OnboardingEntryChannel;
  /** Verified identities after OTP / IdP (preferred V2 input). */
  verifiedIdentities?: InvitationIdentity[];
  /** Pre-resolved invites (V1 shortcut — skips provider resolve). */
  inviteResult?: InvitationResolverResult;
  phoneAccountExists: boolean;
  existingAccountEmail?: string | null;
  existingAccountMasked?: string | null;
  isInviteEmailRegistered: (email: string) => Promise<{
    exists: boolean;
    masked_email?: string;
  }>;
};
