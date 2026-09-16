import {
  clearInitialSupplierForDetail,
  getInitialSupplierForDetail,
  setInitialSupplierForDetail,
} from "@/features/suppliers/initialSupplierForDetail";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";

function row(id: string, extra: Partial<SupplierRow> = {}): SupplierRow {
  return { id, ...extra } as SupplierRow;
}

describe("initialSupplierForDetail", () => {
  afterEach(() => {
    clearInitialSupplierForDetail("a");
    clearInitialSupplierForDetail("b");
  });

  it("returns a stashed row only when ids match", () => {
    setInitialSupplierForDetail(row("a", { name: "Acme Logistics" }));
    expect(getInitialSupplierForDetail("a")?.name).toBe("Acme Logistics");
    expect(getInitialSupplierForDetail("b")).toBeNull();
  });

  it("clears a single supplier id without affecting another", () => {
    setInitialSupplierForDetail(row("a"));
    setInitialSupplierForDetail(row("b"));
    clearInitialSupplierForDetail("a");
    expect(getInitialSupplierForDetail("a")).toBeNull();
    expect(getInitialSupplierForDetail("b")?.id).toBe("b");
  });

  it("returns null for a supplier that was never seeded (direct/deep-link open)", () => {
    expect(getInitialSupplierForDetail("never-seeded")).toBeNull();
  });

  it("overwrites a stale seed for the same id with the newer row", () => {
    setInitialSupplierForDetail(row("a", { name: "Old Name" }));
    setInitialSupplierForDetail(row("a", { name: "New Name" }));
    expect(getInitialSupplierForDetail("a")?.name).toBe("New Name");
  });

  it("does not resurrect a cleared seed for a party switched back to", () => {
    setInitialSupplierForDetail(row("a"));
    clearInitialSupplierForDetail("a");
    setInitialSupplierForDetail(row("b"));
    expect(getInitialSupplierForDetail("a")).toBeNull();
    expect(getInitialSupplierForDetail("b")?.id).toBe("b");
  });
});
