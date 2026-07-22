import {
  getTripExecutionModel,
  isAggregateExecutionTrip,
  isAssetExecutionTrip,
} from "@/features/trips/domain/tripExecutionModel";
import type { TripRow } from "@/features/trips/services/trips.service";

function trip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1",
    organization_id: "org-1",
    ...overrides,
  } as TripRow;
}

describe("tripExecutionModel", () => {
  it("keeps supplier-linked trips aggregate after subcontractor driver assign", () => {
    const aggregateWithDriver = trip({
      supplier_id: "supplier-1",
      driver_id: "driver-1",
      vehicle_id: "vehicle-1",
      trip_payout_mode: null,
    });

    expect(getTripExecutionModel(aggregateWithDriver)).toBe("aggregate");
    expect(isAggregateExecutionTrip(aggregateWithDriver)).toBe(true);
    expect(isAssetExecutionTrip(aggregateWithDriver)).toBe(false);
  });

  it("respects explicit asset payout mode on supplier-linked integrated loads", () => {
    const integratedAsset = trip({
      supplier_id: "supplier-1",
      driver_id: "driver-1",
      trip_payout_mode: "asset",
    });

    expect(getTripExecutionModel(integratedAsset)).toBe("asset");
    expect(isAssetExecutionTrip(integratedAsset)).toBe(true);
  });

  it("treats own-fleet trips without supplier as asset", () => {
    const assetTrip = trip({
      driver_id: "driver-1",
      trip_payout_mode: null,
    });

    expect(getTripExecutionModel(assetTrip)).toBe("asset");
    expect(isAssetExecutionTrip(assetTrip)).toBe(true);
  });

  it("always treats a mover_asset trip as asset (driver payout + expense UI)", () => {
    // Even if payout mode drifts or a supplier_id lingers, the mover's own
    // execution trip must render the asset finance layout.
    const moverAsset = trip({
      source: "mover_asset",
      driver_id: "driver-1",
      vehicle_id: "vehicle-1",
      supplier_id: "supplier-1",
      trip_payout_mode: "market",
    });

    expect(getTripExecutionModel(moverAsset)).toBe("asset");
    expect(isAssetExecutionTrip(moverAsset)).toBe(true);
    expect(isAggregateExecutionTrip(moverAsset)).toBe(false);
  });
});
