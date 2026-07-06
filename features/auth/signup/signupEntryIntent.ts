export type SignupEntryIntent = 'owner' | 'team';

type EntryParams = {
  intent?: unknown;
  invite?: unknown;
  ref?: unknown;
};

/**
 * UX-only entry hint (titles, copy, hide Google). Does not authorize routing after OTP.
 * Supports deep links: ?intent=team, ?invite=team, ?ref=team-invite
 */
export function parseSignupEntryIntent(params: EntryParams | unknown): SignupEntryIntent {
  if (params && typeof params === 'object') {
    const p = params as EntryParams;
    const values = [p.intent, p.invite, p.ref];
    for (const v of values) {
      if (v === 'team' || v === 'member' || v === 'join' || v === 'team-invite') {
        return 'team';
      }
    }
  }
  if (params === 'team' || params === 'member' || params === 'join') {
    return 'team';
  }
  return 'owner';
}

export function signupEntrySource(params: EntryParams | unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const p = params as EntryParams;
  if (p.invite != null) return 'invite_link';
  if (p.ref != null) return String(p.ref);
  if (p.intent === 'team') return 'join_company_hub';
  return undefined;
}
