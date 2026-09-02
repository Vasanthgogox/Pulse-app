/**
 * Three-state resolution for the Add Client / Add Supplier phone lookup.
 *
 * `get_invitee_by_phone` deliberately hides ACTIVE members of the caller's own
 * org, so a null result is ambiguous — it means either "no platform account" or
 * "one of your own people". The UI used to read null as NOT_FOUND and offer the
 * offline path, which the service guard then rejected at submit: a dead-end
 * funnel that told the user the opposite of the truth.
 *
 * This resolves the ambiguity with a follow-up boolean RPC, producing:
 *   EXTERNAL  — invitee returned; normal connect flow
 *   SAME_ORG  — hidden because they are an active member here; block entirely
 *   NOT_FOUND — genuinely not on the platform; offline add allowed
 *   ERROR     — could not determine; block and let the user retry
 *
 * ERROR must never collapse into NOT_FOUND. Not knowing whether a number is a
 * colleague is not the same as knowing it isn't one, and falling through would
 * recreate exactly the misleading offline path this exists to close.
 */
import { isActiveOrgMemberPhone } from '@/features/connections/services/connectionRequests.service';

export type PartyPhoneLookupStatus =
  | 'idle'
  | 'loading'
  | 'external'
  | 'same_org'
  | 'not_found'
  | 'error';

/**
 * Classify a phone after the invitee lookup has already run.
 *
 * Call ONLY when the invitee lookup returned null and the phone is valid —
 * flows without invite search must not pay for the extra round-trip.
 *
 * Never throws: a failed probe resolves to 'error' so the caller can render a
 * retryable state rather than guessing.
 */
export async function classifyNullInviteeResult(
  phone: string,
  orgId: string,
): Promise<'same_org' | 'not_found' | 'error'> {
  if (!orgId) return 'not_found';
  try {
    const isMember = await isActiveOrgMemberPhone(phone, orgId);
    return isMember ? 'same_org' : 'not_found';
  } catch {
    return 'error';
  }
}

export const SAME_ORG_PARTY_TITLE = 'Member of your organization';

export function sameOrgPartyMessage(kind: 'client' | 'supplier'): string {
  return kind === 'client'
    ? 'This number belongs to a member of your organization. You cannot add your own team as a customer.'
    : 'This number belongs to a member of your organization. You cannot add your own team as a supplier.';
}

export const PARTY_LOOKUP_ERROR_MESSAGE =
  "Couldn't verify this number. Check your connection and try again.";
