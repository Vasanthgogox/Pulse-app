import { getDocumentsByEntity } from "@/features/compliance";
import {
  averageScoreDeduped,
  getRatingsForDriver,
} from "@/features/ratings/services/ratings.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import { useQuery } from "@tanstack/react-query";
import { hasEntityDocsIssue } from "../utils/manifestRefAssetCompliance.util";

export type ManifestRefAssetPartyInsights = {
  /** Global average (all ratings for driver; fleet performance score as stars for vehicle). */
  ratingAvg: number | null;
  docsIssue: boolean;
};

export type ManifestRefAssetInsights = {
  driver: ManifestRefAssetPartyInsights;
  vehicle: ManifestRefAssetPartyInsights;
};

const EMPTY_PARTY: ManifestRefAssetPartyInsights = {
  ratingAvg: null,
  docsIssue: false,
};

type Params = {
  orgId: string | null | undefined;
  driverId: string | null | undefined;
  vehicleId: string | null | undefined;
};

export function useManifestRefAssetInsights({
  orgId,
  driverId,
  vehicleId,
}: Params) {
  const org = orgId?.trim() ?? "";
  const driver = driverId?.trim() ?? "";
  const vehicle = vehicleId?.trim() ?? "";

  return useQuery({
    queryKey: ["manifest-ref-asset-insights", org, driver, vehicle],
    enabled: !!org && (!!driver || !!vehicle),
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<ManifestRefAssetInsights> => {
      const result: ManifestRefAssetInsights = {
        driver: { ...EMPTY_PARTY },
        vehicle: { ...EMPTY_PARTY },
      };

      const tasks: Promise<void>[] = [];

      if (driver) {
        tasks.push(
          (async () => {
            const [ratingsRes, docsRes] = await Promise.all([
              getRatingsForDriver(driver, signal),
              getDocumentsByEntity(org, "driver", driver, signal),
            ]);
            const ratings = ratingsRes.error ? [] : ratingsRes.ratings;
            result.driver.ratingAvg = averageScoreDeduped(ratings);
            result.driver.docsIssue = hasEntityDocsIssue(
              "driver",
              docsRes.error ? [] : docsRes.documents,
            );
          })(),
        );
      }

      if (vehicle) {
        tasks.push(
          (async () => {
            const [docsRes, vehicleRes] = await Promise.all([
              getDocumentsByEntity(org, "vehicle", vehicle, signal),
              getVehicleById(org, vehicle, signal),
            ]);
            const entityDocs = docsRes.error ? [] : docsRes.documents;
            const legacyDocs = vehicleRes.error
              ? null
              : (vehicleRes.vehicle?.documents ?? null);
            result.vehicle.docsIssue = hasEntityDocsIssue(
              "vehicle",
              entityDocs,
              legacyDocs,
            );
          })(),
        );
      }

      await Promise.all(tasks);
      return result;
    },
  });
}
