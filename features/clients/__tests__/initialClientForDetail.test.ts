import {
  clearInitialClientForDetail,
  getInitialClientForDetail,
  setInitialClientForDetail,
} from "@/features/clients/initialClientForDetail";
import type { ClientRow } from "@/features/clients/services/clients.service";

function row(id: string, extra: Partial<ClientRow> = {}): ClientRow {
  return { id, ...extra } as ClientRow;
}

describe("initialClientForDetail", () => {
  afterEach(() => {
    clearInitialClientForDetail("a");
    clearInitialClientForDetail("b");
  });

  it("returns a stashed row only when ids match", () => {
    setInitialClientForDetail(row("a", { name: "Apple" }));
    expect(getInitialClientForDetail("a")?.name).toBe("Apple");
    expect(getInitialClientForDetail("b")).toBeNull();
  });

  it("clears a single client id without affecting another", () => {
    setInitialClientForDetail(row("a"));
    setInitialClientForDetail(row("b"));
    clearInitialClientForDetail("a");
    expect(getInitialClientForDetail("a")).toBeNull();
    expect(getInitialClientForDetail("b")?.id).toBe("b");
  });

  it("returns null for a client that was never seeded (direct/deep-link open)", () => {
    expect(getInitialClientForDetail("never-seeded")).toBeNull();
  });

  it("overwrites a stale seed for the same id with the newer row", () => {
    setInitialClientForDetail(row("a", { name: "Old Name" }));
    setInitialClientForDetail(row("a", { name: "New Name" }));
    expect(getInitialClientForDetail("a")?.name).toBe("New Name");
  });

  it("does not resurrect a cleared seed for a party switched back to", () => {
    setInitialClientForDetail(row("a"));
    clearInitialClientForDetail("a");
    setInitialClientForDetail(row("b"));
    // Switching Party A -> Party B: A's cleared seed must never leak as B's.
    expect(getInitialClientForDetail("a")).toBeNull();
    expect(getInitialClientForDetail("b")?.id).toBe("b");
  });
});
