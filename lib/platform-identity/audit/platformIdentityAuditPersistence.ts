import { supabase } from '@/lib/supabase';

import type { PlatformIdentityAuditEvent } from './platformIdentityAudit';

export type PlatformIdentityAuditRow = {
  event_type: string;
  person_id: string | null;
  organization_id: string | null;
  membership_id: string | null;
  invite_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

export async function persistPlatformIdentityAuditEvent(
  event: PlatformIdentityAuditEvent,
): Promise<{ error: Error | null }> {
  try {
    // RLS requires an authenticated session (person_id = auth.uid()); skip persistence
    // for events that fire pre-session (e.g. phone OTP verify before signup completes).
    const { data: { session } } = await supabase().auth.getSession();
    if (!session) {
      if (__DEV__) {
        console.warn('[platform-identity:audit] persist skipped: no session yet', event.type);
      }
      return { error: null };
    }

    const row: PlatformIdentityAuditRow = {
      event_type: event.type,
      person_id: event.personId ?? null,
      organization_id: event.organizationId ?? null,
      membership_id: event.membershipId ?? null,
      invite_id: event.inviteId ?? null,
      metadata: event.metadata ?? {},
      occurred_at: event.occurredAt,
    };

    const { error } = await supabase().from('platform_identity_audit_events').insert(row);
    if (error) {
      // Table may not exist until migration is applied — non-fatal in V1.
      if (__DEV__) {
        console.warn('[platform-identity:audit] persist skipped:', error.message);
      }
      return { error: new Error(error.message) };
    }
    return { error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (__DEV__) {
      console.warn('[platform-identity:audit] persist failed:', err.message);
    }
    return { error: err };
  }
}
