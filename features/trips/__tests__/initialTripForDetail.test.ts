import {
  clearInitialTripForDetail,
  getInitialTripForDetail,
  setInitialTripForDetail,
} from "@/features/trips/initialTripForDetail";
import type { TripRow } from "@/features/trips/services/trips.service";

function row(id: string, extra: Partial<TripRow> = {}): TripRow {
  return { id, ...extra } as TripRow;
}

describe("initialTripForDetail", () => {
  afterEach(() => {
    clearInitialTripForDetail("a");
    clearInitialTripForDetail("b");
  });

  it("returns a stashed row only when ids match", () => {
    setInitialTripForDetail(row("a", { trip_number: "TRP001" }));
    expect(getInitialTripForDetail("a")?.trip_number).toBe("TRP001");
    expect(getInitialTripForDetail("b")).toBeNull();
  });

  it("clears a single trip id without affecting another", () => {
    setInitialTripForDetail(row("a"));
    setInitialTripForDetail(row("b"));
    clearInitialTripForDetail("a");
    expect(getInitialTripForDetail("a")).toBeNull();
    expect(getInitialTripForDetail("b")?.id).toBe("b");
  });
});
