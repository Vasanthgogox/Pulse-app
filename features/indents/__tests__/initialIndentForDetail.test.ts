import {
  clearInitialIndentForDetail,
  getInitialIndentForDetail,
  setInitialIndentForDetail,
} from "@/features/indents/initialIndentForDetail";
import type { IndentRow } from "@/features/indents/services/indents.service";

function row(id: string, extra: Partial<IndentRow> = {}): IndentRow {
  return { id, ...extra } as IndentRow;
}

describe("initialIndentForDetail", () => {
  afterEach(() => {
    clearInitialIndentForDetail("a");
    clearInitialIndentForDetail("b");
  });

  it("returns a stashed row only when ids match", () => {
    setInitialIndentForDetail(row("a", { pickup_area: "Mumbai" }));
    expect(getInitialIndentForDetail("a")?.pickup_area).toBe("Mumbai");
    expect(getInitialIndentForDetail("b")).toBeNull();
  });

  it("clears a single indent id without affecting another", () => {
    setInitialIndentForDetail(row("a"));
    setInitialIndentForDetail(row("b"));
    clearInitialIndentForDetail("a");
    expect(getInitialIndentForDetail("a")).toBeNull();
    expect(getInitialIndentForDetail("b")?.id).toBe("b");
  });

  it("returns null for an indent that was never seeded (direct/deep-link open)", () => {
    expect(getInitialIndentForDetail("never-seeded")).toBeNull();
  });

  it("overwrites a stale seed for the same id with the newer row", () => {
    setInitialIndentForDetail(row("a", { pickup_area: "Old" }));
    setInitialIndentForDetail(row("a", { pickup_area: "New" }));
    expect(getInitialIndentForDetail("a")?.pickup_area).toBe("New");
  });

  it("does not resurrect a cleared seed for an indent switched back to", () => {
    setInitialIndentForDetail(row("a"));
    clearInitialIndentForDetail("a");
    setInitialIndentForDetail(row("b"));
    expect(getInitialIndentForDetail("a")).toBeNull();
    expect(getInitialIndentForDetail("b")?.id).toBe("b");
  });
});
