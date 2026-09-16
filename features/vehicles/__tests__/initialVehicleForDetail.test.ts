import {
  clearInitialVehicleForDetail,
  getInitialVehicleForDetail,
  setInitialVehicleForDetail,
} from "@/features/vehicles/initialVehicleForDetail";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";

function row(id: string, extra: Partial<VehicleRow> = {}): VehicleRow {
  return { id, ...extra } as VehicleRow;
}

describe("initialVehicleForDetail", () => {
  afterEach(() => {
    clearInitialVehicleForDetail("a");
    clearInitialVehicleForDetail("b");
  });

  it("returns a stashed row only when ids match", () => {
    setInitialVehicleForDetail(row("a", { vehicle_number: "MH12AB1234" }));
    expect(getInitialVehicleForDetail("a")?.vehicle_number).toBe("MH12AB1234");
    expect(getInitialVehicleForDetail("b")).toBeNull();
  });

  it("clears a single vehicle id without affecting another", () => {
    setInitialVehicleForDetail(row("a"));
    setInitialVehicleForDetail(row("b"));
    clearInitialVehicleForDetail("a");
    expect(getInitialVehicleForDetail("a")).toBeNull();
    expect(getInitialVehicleForDetail("b")?.id).toBe("b");
  });

  it("returns null for a vehicle that was never seeded (direct/deep-link open)", () => {
    expect(getInitialVehicleForDetail("never-seeded")).toBeNull();
  });

  it("overwrites a stale seed for the same id with the newer row", () => {
    setInitialVehicleForDetail(row("a", { vehicle_number: "OLD1234" }));
    setInitialVehicleForDetail(row("a", { vehicle_number: "NEW1234" }));
    expect(getInitialVehicleForDetail("a")?.vehicle_number).toBe("NEW1234");
  });

  it("does not resurrect a cleared seed for a party switched back to", () => {
    setInitialVehicleForDetail(row("a"));
    clearInitialVehicleForDetail("a");
    setInitialVehicleForDetail(row("b"));
    expect(getInitialVehicleForDetail("a")).toBeNull();
    expect(getInitialVehicleForDetail("b")?.id).toBe("b");
  });
});
