import { listOperationsOutbox } from "@/features/trips/operations/offline/outbox";
import { getTripFuelEntries } from "@/features/trips/operations/fuel/fuel.service";
import { getTripTollEntries } from "@/features/trips/operations/toll/toll.service";

export interface OperationalObservabilitySnapshot {
  postingFailures: number;
  postingRetries: number;
  syncQueueFailures: number;
  syncQueuePending: number;
  offlineQueueOldestAgeMinutes: number | null;
  reconciliationFailures: number;
  duplicatePreventionHits: number;
}

export async function getOperationalObservabilitySnapshot(input: {
  tripId: string;
}): Promise<{ error: Error | null; snapshot: OperationalObservabilitySnapshot | null }> {
  const [fuelRes, tollRes, queue] = await Promise.all([
    getTripFuelEntries(input.tripId),
    getTripTollEntries(input.tripId),
    listOperationsOutbox(),
  ]);
  if (fuelRes.error) return { error: fuelRes.error, snapshot: null };
  if (tollRes.error) return { error: tollRes.error, snapshot: null };
  const allOps = [...fuelRes.entries, ...tollRes.entries];
  const postingFailures = allOps.filter((entry) => entry.posting_state === "failed").length;
  const postingRetries = allOps.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.retry_count ?? 0) || 0),
    0,
  );
  const duplicatePreventionHits = allOps.filter(
    (entry) =>
      String(entry.posting_error ?? "").toLowerCase().includes("duplicate") ||
      String(entry.posting_error ?? "").toLowerCase().includes("already"),
  ).length;
  const queueFailures = queue.filter((item) => item.status === "failed");
  const queuePending = queue.filter((item) => item.status !== "failed");
  const oldestCreated = [...queue].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  )[0]?.createdAt;
  const offlineQueueOldestAgeMinutes = oldestCreated
    ? Math.max(0, Math.round((Date.now() - +new Date(oldestCreated)) / 60000))
    : null;
  return {
    error: null,
    snapshot: {
      postingFailures,
      postingRetries,
      syncQueueFailures: queueFailures.length,
      syncQueuePending: queuePending.length,
      offlineQueueOldestAgeMinutes,
      reconciliationFailures: postingFailures,
      duplicatePreventionHits,
    },
  };
}
