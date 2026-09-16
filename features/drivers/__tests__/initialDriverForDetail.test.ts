import {
  clearInitialDriverForDetail,
  getInitialDriverForDetail,
  setInitialDriverForDetail,
} from "@/features/drivers/initialDriverForDetail";
import type { DriverRow } from "@/features/drivers/services/drivers.service";

function row(id: string, extra: Partial<DriverRow> = {}): DriverRow {
  return { id, ...extra } as DriverRow;
}

describe("initialDriverForDetail", () => {
  afterEach(() => {
    clearInitialDriverForDetail("a");
    clearInitialDriverForDetail("b");
  });

  it("returns a stashed row only when ids match", () => {
    setInitialDriverForDetail(row("a", { name: "Ravi Kumar" }));
    expect(getInitialDriverForDetail("a")?.name).toBe("Ravi Kumar");
    expect(getInitialDriverForDetail("b")).toBeNull();
  });

  it("clears a single driver id without affecting another", () => {
    setInitialDriverForDetail(row("a"));
    setInitialDriverForDetail(row("b"));
    clearInitialDriverForDetail("a");
    expect(getInitialDriverForDetail("a")).toBeNull();
    expect(getInitialDriverForDetail("b")?.id).toBe("b");
  });

  it("returns null for a driver that was never seeded (direct/deep-link open)", () => {
    expect(getInitialDriverForDetail("never-seeded")).toBeNull();
  });

  it("overwrites a stale seed for the same id with the newer row", () => {
    setInitialDriverForDetail(row("a", { name: "Old Name" }));
    setInitialDriverForDetail(row("a", { name: "New Name" }));
    expect(getInitialDriverForDetail("a")?.name).toBe("New Name");
  });

  it("does not resurrect a cleared seed for a party switched back to", () => {
    setInitialDriverForDetail(row("a"));
    clearInitialDriverForDetail("a");
    setInitialDriverForDetail(row("b"));
    expect(getInitialDriverForDetail("a")).toBeNull();
    expect(getInitialDriverForDetail("b")?.id).toBe("b");
  });
});
