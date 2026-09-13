import { splitLocationParts } from "@/features/network/utils/storyDisplay";

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
