import {
  computeComplianceScore,
  type DocumentRow,
} from "@/features/compliance";
import { computeDocExpiry } from "@/features/vehicles/components/analytics/analyticsUtils";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";

export function hasEntityDocsIssue(
  entityType: "driver" | "vehicle",
  entityDocuments: DocumentRow[],
  vehicleLegacyDocs?: VehicleDocuments | null,
): boolean {
  const score = computeComplianceScore(entityDocuments, entityType);
  if (score.breakdown.missing > 0 || score.breakdown.expired > 0) {
    return true;
  }

  if (entityType !== "vehicle" || !vehicleLegacyDocs) {
    return false;
  }

  const legacyRows = computeDocExpiry({
    documents: vehicleLegacyDocs,
  } as Pick<VehicleRow, "documents"> as VehicleRow);
  return legacyRows.some(
    (row) => row.status === "missing" || row.status === "expired",
  );
}

export function performanceScoreToStarRating(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return Math.round((clamped / 20) * 10) / 10;
}
