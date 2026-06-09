/**
 * Auto-prompt schedule for the business connection invite modal:
 * show at most once per calendar day, for up to 3 days, then stop auto-showing.
 * Manual opens (invitations list) are not gated by this schedule.
 */
import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'connection_invite_auto_prompt_v1';

export const CONNECTION_INVITE_AUTO_PROMPT_MAX_DAYS = 3;

export type ConnectionInviteAutoPromptRecord = {
  shownDates: string[];
};

function storageKey(orgId: string, partnerKey: string): string {
  return `${STORAGE_PREFIX}:${orgId}:${partnerKey}`;
}

/** Local calendar date — YYYY-MM-DD */
export function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseAutoPromptRecord(raw: string | null): ConnectionInviteAutoPromptRecord {
  if (!raw) return { shownDates: [] };
  try {
    const parsed = JSON.parse(raw) as ConnectionInviteAutoPromptRecord;
    if (!Array.isArray(parsed.shownDates)) return { shownDates: [] };
    return {
      shownDates: parsed.shownDates
        .filter((d): d is string => typeof d === 'string')
        .slice(0, CONNECTION_INVITE_AUTO_PROMPT_MAX_DAYS),
    };
  } catch {
    return { shownDates: [] };
  }
}

export function isAutoPromptEligible(
  record: ConnectionInviteAutoPromptRecord,
  today = localDateKey(),
): boolean {
  const unique = [...new Set(record.shownDates)];
  if (unique.length >= CONNECTION_INVITE_AUTO_PROMPT_MAX_DAYS) return false;
  return !unique.includes(today);
}

export function recordAutoPromptDay(
  record: ConnectionInviteAutoPromptRecord,
  today = localDateKey(),
): ConnectionInviteAutoPromptRecord {
  const unique = [...new Set(record.shownDates)];
  if (unique.includes(today)) {
    return { shownDates: unique.slice(0, CONNECTION_INVITE_AUTO_PROMPT_MAX_DAYS) };
  }
  return {
    shownDates: [...unique, today].slice(0, CONNECTION_INVITE_AUTO_PROMPT_MAX_DAYS),
  };
}

export function inviteAutoPromptKey(item: InboundProtocolInviteItem): string {
  return item.partnerOrgId?.trim() || item.id;
}

export async function loadAutoPromptRecord(
  orgId: string,
  partnerKey: string,
): Promise<ConnectionInviteAutoPromptRecord> {
  const raw = await AsyncStorage.getItem(storageKey(orgId, partnerKey));
  return parseAutoPromptRecord(raw);
}

export async function saveAutoPromptRecord(
  orgId: string,
  partnerKey: string,
  record: ConnectionInviteAutoPromptRecord,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(orgId, partnerKey), JSON.stringify(record));
}

export async function clearAutoPromptRecord(
  orgId: string,
  partnerKey: string,
): Promise<void> {
  await AsyncStorage.removeItem(storageKey(orgId, partnerKey));
}
