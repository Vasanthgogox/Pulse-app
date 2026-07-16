export type PlatformIdentityAuditEventType =
  | 'invitation.created'
  | 'invitation.accepted'
  | 'invitation.declined'
  | 'employment.rejected'
  | 'workspace.switched'
  | 'identity.verified'
  | 'identity.sso_linked'
  | 'identity.phone_verified'
  | 'identity.email_verified'
  | 'membership.terminated'
  | 'person.suspended'
  | 'policy.evaluated';

export type PlatformIdentityAuditEvent = {
  type: PlatformIdentityAuditEventType;
  personId?: string | null;
  organizationId?: string | null;
  membershipId?: string | null;
  inviteId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt: string;
};

const auditBuffer: PlatformIdentityAuditEvent[] = [];

/** Immutable audit events — in-memory buffer + async DB persist when migration applied. */
export function recordPlatformIdentityAudit(
  event: Omit<PlatformIdentityAuditEvent, 'occurredAt'> & { occurredAt?: string },
): PlatformIdentityAuditEvent {
  const record: PlatformIdentityAuditEvent = {
    ...event,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  };
  auditBuffer.push(record);
  if (__DEV__) {
    console.log('[platform-identity:audit]', record.type, record);
  }
  scheduleAuditPersist(record);
  return record;
}

/**
 * Best-effort async DB persist. Skipped under Jest — dynamic `import()` throws
 * in Jest's CJS VM without `--experimental-vm-modules` and kills the worker.
 */
function scheduleAuditPersist(record: PlatformIdentityAuditEvent): void {
  if (typeof process !== 'undefined' && process.env.JEST_WORKER_ID != null) {
    return;
  }
  try {
    void import('./platformIdentityAuditPersistence')
      .then(({ persistPlatformIdentityAuditEvent }) =>
        persistPlatformIdentityAuditEvent(record),
      )
      .catch(() => undefined);
  } catch {
    // Dynamic import unavailable in this runtime — buffer-only is fine.
  }
}

export function getPlatformIdentityAuditBuffer(): readonly PlatformIdentityAuditEvent[] {
  return auditBuffer;
}

export function clearPlatformIdentityAuditBuffer(): void {
  auditBuffer.length = 0;
}
