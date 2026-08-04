/**
 * Persisted "Later" state for the awarded-indent deploy interrupt.
 *
 * - First award → full modal (ops surfaces only)
 * - Later / minimize → bottom peek on Trips / Load Center
 * - Peek does NOT follow onto Finance / Chat (route allowlist)
 * - Overdue escalation may re-open the full modal for forgotten loads
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/** How long "Later" holds an award to the peek before overdue rules may escalate. */
export const DEPLOY_SNOOZE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Pickup lateness past which an ignored award may interrupt with the full modal again. */
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
    // Best-effort persistence
  }
}

/** Load all Later timestamps for an org, keyed by indent id. */
export async function loadDeploySnoozes(orgId: string): Promise<Record<string, number>> {
  const map = await readSnoozeMap(orgId);
  const result: Record<string, number> = {};
  for (const [indentId, record] of Object.entries(map)) {
    result[indentId] = record.snoozedAtMs;
  }
  return result;
}

/** Record that the user tapped Later / minimized (demote to peek). */
export async function saveDeploySnooze(
  orgId: string,
  indentId: string,
  nowMs: number,
): Promise<void> {
  const map = await readSnoozeMap(orgId);
  map[indentId] = { snoozedAtMs: nowMs };
  await writeSnoozeMap(orgId, map);
}

/** Clear Later state — trip created, award gone, or user expands the peek. */
export async function clearDeploySnooze(orgId: string, indentId: string): Promise<void> {
  const map = await readSnoozeMap(orgId);
  if (!(indentId in map)) return;
  delete map[indentId];
  await writeSnoozeMap(orgId, map);
}

export type DeployVisibilityDecision = "full_modal" | "peek";

/**
 * Decide interrupt level for a pending award.
 * - Never snoozed → full modal
 * - Later → peek (bottom card), unless severely overdue
 */
export function decideDeployVisibility(params: {
  snoozedAtMs: number | undefined;
  pickupDateIso: string | null | undefined;
  nowMs: number;
}): DeployVisibilityDecision {
  const { snoozedAtMs, pickupDateIso, nowMs } = params;
  if (snoozedAtMs == null) return "full_modal";

  const pickupMs = pickupDateIso ? new Date(pickupDateIso).getTime() : NaN;
  const severelyOverdueSinceSnooze =
    Number.isFinite(pickupMs) &&
    nowMs - pickupMs >= DEPLOY_OVERDUE_ESCALATION_MS &&
    snoozedAtMs - pickupMs < DEPLOY_OVERDUE_ESCALATION_MS;
  if (severelyOverdueSinceSnooze) return "full_modal";

  return "peek";
}
