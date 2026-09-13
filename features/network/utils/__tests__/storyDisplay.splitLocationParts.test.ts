import {
  looksLikePlannerStopSummary,
  routeEndpointLines,
  splitLocationParts,
} from "@/features/network/utils/storyDisplay";

describe("splitLocationParts", () => {
  it("splits a plain 'City, State' address as before", () => {
    expect(splitLocationParts("Chennai, Tamil Nadu")).toEqual({
      city: "Chennai",
      state: "Tamil Nadu",
    });
  });

  it("does not split on commas inside a parenthesized merged-plan summary", () => {
    expect(splitLocationParts("2 pickups (Pickup A, Pickup B)")).toEqual({
      city: "2 pickups (Pickup A, Pickup B)",
      state: "",
    });
    expect(splitLocationParts("2 drops (Drop C, Drop D)")).toEqual({
      city: "2 drops (Drop C, Drop D)",
      state: "",
    });
  });

  it("keeps a single-stop label with no comma unchanged", () => {
    expect(splitLocationParts("Pickup A")).toEqual({ city: "Pickup A", state: "" });
  });

  it("returns an em dash placeholder for empty input", () => {
    expect(splitLocationParts(null)).toEqual({ city: "—", state: "" });
    expect(splitLocationParts("")).toEqual({ city: "—", state: "" });
  });
});

describe("routeEndpointLines", () => {
  it("splits city and state onto two lines", () => {
    expect(routeEndpointLines("Chennai, Tamil Nadu")).toEqual([
      "Chennai",
      "Tamil Nadu",
    ]);
  });

  it("shows each multi-stop location on its own line", () => {
    expect(
      routeEndpointLines("Ramaraj street · Banglore, Karnataka"),
    ).toEqual(["Ramaraj street", "Banglore, Karnataka"]);
  });

  it("unwraps a legacy counted drop summary so the full list is visible", () => {
    expect(routeEndpointLines("2 drops (Ramaraj street, Banglore, Karnataka)")).toEqual([
      "Ramaraj street, Banglore, Karnataka",
    ]);
  });
});

describe("looksLikePlannerStopSummary", () => {
  it("detects planner labels and counted stop lists", () => {
    expect(looksLikePlannerStopSummary("Pickup A")).toBe(true);
    expect(looksLikePlannerStopSummary("2 drops (Drop C, Drop D)")).toBe(true);
    expect(looksLikePlannerStopSummary("Chennai, Tamil Nadu")).toBe(false);
  });
});
