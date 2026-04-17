/**
 * Local (AsyncStorage) tracking of user actions on Client Feed entries.
 *
 * Why local and not in DB?
 *   The PRD explicitly says "keep backend light" — no new tables/columns, and this repo
 *   is a client of Q-unified-base (migrations live there). Recording who linked/ignored
 *   which feed entry is a UX convenience and can be rebuilt from the canonical ledger
 *   + dispute table, so we don't need durable multi-device state for v1.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ClientFeedLocalStatusKind =
  | "ADDED"
  | "LINKED"
  | "IGNORED"
  | "DISPUTED";

export interface ClientFeedLocalStatus {
  kind: ClientFeedLocalStatusKind;
  /** When set, the id of the local ledger row the feed entry is tied to. */
  localEntryId?: string | null;
  /** ISO timestamp of when this action was recorded. */
  at: string;
}

function keyForOrg(orgId: string): string {
  return `qmobile:client_feed_status:${orgId}`;
}

async function readMap(
  orgId: string,
): Promise<Record<string, ClientFeedLocalStatus>> {
  try {
    const raw = await AsyncStorage.getItem(keyForOrg(orgId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ClientFeedLocalStatus>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(
  orgId: string,
  map: Record<string, ClientFeedLocalStatus>,
): Promise<void> {
  await AsyncStorage.setItem(keyForOrg(orgId), JSON.stringify(map));
}

export async function getClientFeedStatusMap(
  orgId: string,
): Promise<Record<string, ClientFeedLocalStatus>> {
  if (!orgId) return {};
  return readMap(orgId);
}

export async function setClientFeedEntryStatus(
  orgId: string,
  entryId: string,
  status: ClientFeedLocalStatus,
): Promise<void> {
  if (!orgId || !entryId) return;
  const map = await readMap(orgId);
  map[entryId] = status;
  await writeMap(orgId, map);
}

export async function clearClientFeedEntryStatus(
  orgId: string,
  entryId: string,
): Promise<void> {
  if (!orgId || !entryId) return;
  const map = await readMap(orgId);
  if (map[entryId]) {
    delete map[entryId];
    await writeMap(orgId, map);
  }
}
