import {
  RECOMMENDED_INDIA_COURIERS,
  TYPED_COURIER_VALUE,
  filterCourierPartners,
  hasExactCourierLabel,
  mergeCourierPartnerLists,
  resolveCourierDisplayName,
} from "../indiaCourierPartners";

describe("India courier directory", () => {
  it("includes Aramex and Delhivery in recommendations", () => {
    const labels = RECOMMENDED_INDIA_COURIERS.map((row) => row.label);
    expect(labels).toEqual(expect.arrayContaining(["Aramex", "Delhivery"]));
  });

  it("lets workspace rows win over recommendations", () => {
    const merged = mergeCourierPartnerLists(
      [
        {
          label: "Delhivery Express",
          value: "delhivery",
          category: "other",
        },
      ],
      RECOMMENDED_INDIA_COURIERS,
    );
    expect(merged.find((row) => row.value === "delhivery")?.label).toBe(
      "Delhivery Express",
    );
  });

  it("filters by typed query including Aramex", () => {
    const merged = mergeCourierPartnerLists([]);
    const hits = filterCourierPartners(merged, "ara");
    expect(hits.map((row) => row.label)).toContain("Aramex");
  });

  it("detects when the typed name is already in the list", () => {
    const merged = mergeCourierPartnerLists([]);
    expect(hasExactCourierLabel(merged, "Aramex")).toBe(true);
    expect(hasExactCourierLabel(merged, "Local Bike")).toBe(false);
  });

  it("resolves a typed courier name", () => {
    expect(
      resolveCourierDisplayName([], TYPED_COURIER_VALUE, "Local Bike"),
    ).toBe("Local Bike");
  });
});
