import AsyncStorage from "@react-native-async-storage/async-storage";

export interface LocalTripSubcontractRow {
  id: string;
  viewer_org_id: string;
  trip_id: string;
  supplier_id: string;
  rate: number;
  updated_at: string;
}

function keyForOrg(orgId: string): string {
  return `qmobile:trip_subcontracts:${orgId}`;
}

async function readMap(orgId: string): Promise<Record<string, LocalTripSubcontractRow>> {
  const raw = await AsyncStorage.getItem(keyForOrg(orgId));
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, LocalTripSubcontractRow>;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

async function writeMap(orgId: string, map: Record<string, LocalTripSubcontractRow>): Promise<void> {
  await AsyncStorage.setItem(keyForOrg(orgId), JSON.stringify(map));
}

export async function upsertLocalTripSubcontract(params: {
  viewerOrgId: string;
  tripId: string;
  supplierId: string;
  rate: number;
}): Promise<LocalTripSubcontractRow> {
  const { viewerOrgId, tripId, supplierId, rate } = params;
  const now = new Date().toISOString();
  const map = await readMap(viewerOrgId);
  const row: LocalTripSubcontractRow = {
    id: `local-${viewerOrgId}-${tripId}`,
    viewer_org_id: viewerOrgId,
    trip_id: tripId,
    supplier_id: supplierId,
    rate,
    updated_at: now,
  };
  map[tripId] = row;
  await writeMap(viewerOrgId, map);
  return row;
}

export async function getLocalTripSubcontracts(params: {
  viewerOrgId: string;
  tripIds: string[];
}): Promise<LocalTripSubcontractRow[]> {
  const { viewerOrgId, tripIds } = params;
  if (!viewerOrgId || tripIds.length === 0) return [];
  const map = await readMap(viewerOrgId);
  return tripIds
    .map((id) => map[id])
    .filter(Boolean)
    .map((r) => ({ ...r }));
}

