/**
 * Persisted "Later" snooze for the awarded-indent deploy modal.
 *
 * A snoozed award should stay collapsed to the low-friction peek across app
 * foreground/background and app restarts — only cooldown expiry or a truly
 * overdue-and-ignored trip should bring back the full-screen modal.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/** How long "Later" holds an award to the peek before it's eligible to re-escalate. */
export const DEPLOY_SNOOZE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Pickup lateness threshold past which an ignored award re-escalates even during cooldown. */
export const DEPLOY_OVERDUE_ESCALATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const STORAGE_KEY_PREFIX = "awarded_deploy_snooze_v1";

type SnoozeRecord = { snoozedAtMs: number };
type SnoozeMap = Record<string, SnoozeRecord>;

function storageKey(orgId: string): string {
  return `${STORAGE_KEY_PREFIX}:${orgId}`;
}

async function readSnoozeMap(orgId: string): Promise<SnoozeMap> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(orgId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SnoozeMap) : {};
  } catch {
    return {};
  }
}

async function writeSnoozeMap(orgId: string, map: SnoozeMap): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(orgId), JSON.stringify(map));
  } catch {
    // Best-effort persistence — a failed write just means this snooze
    // behaves like the old session-only behavior until next success.
  }
}

/** Load all snooze timestamps for an org, keyed by indent id. */
export async function loadDeploySnoozes(orgId: string): Promise<Record<string, number>> {
  const map = await readSnoozeMap(orgId);
  const result: Record<string, number> = {};
  for (const [indentId, record] of Object.entries(map)) {
    result[indentId] = record.snoozedAtMs;
  }
  return result;
}

/** Record that the user tapped "Later" on this indent right now. */
export async function saveDeploySnooze(orgId: string, indentId: string, nowMs: number): Promise<void> {
  const map = await readSnoozeMap(orgId);
  map[indentId] = { snoozedAtMs: nowMs };
  await writeSnoozeMap(orgId, map);
}

/** Clear a snooze — used once a trip exists for the indent or the award is gone. */
export async function clearDeploySnooze(orgId: string, indentId: string): Promise<void> {
  const map = await readSnoozeMap(orgId);
  if (!(indentId in map)) return;
  delete map[indentId];
  await writeSnoozeMap(orgId, map);
}

export type DeployVisibilityDecision = "full_modal" | "peek";

/**
 * Decide whether a snoozed award should re-escalate to the full modal.
 * Not snoozed at all → caller treats it as a new award (full modal).
 */
export function decideDeployVisibility(params: {
  snoozedAtMs: number | undefined;
  pickupDateIso: string | null | undefined;
  nowMs: number;
}): DeployVisibilityDecision {
  const { snoozedAtMs, pickupDateIso, nowMs } = params;
  if (snoozedAtMs == null) return "full_modal";

  const cooldownExpired = nowMs - snoozedAtMs >= DEPLOY_SNOOZE_COOLDOWN_MS;
  if (cooldownExpired) return "full_modal";

  const pickupMs = pickupDateIso ? new Date(pickupDateIso).getTime() : NaN;
  const severelyOverdueSinceSnooze =
    Number.isFinite(pickupMs) &&
    nowMs - pickupMs >= DEPLOY_OVERDUE_ESCALATION_MS &&
    // Only escalate if the overdue threshold was crossed *after* the user
    // already saw and dismissed it — otherwise every already-ignored old
    // award re-escalates the instant cooldown math allows it.
    snoozedAtMs - pickupMs < DEPLOY_OVERDUE_ESCALATION_MS;
  if (severelyOverdueSinceSnooze) return "full_modal";

  return "peek";
}
