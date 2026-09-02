import { formatTrackingDateTime } from "@/features/trips/utils/formatTrackingTimestamp.util";

describe("formatTrackingDateTime", () => {
  it("includes both calendar date and clock time for an ISO timestamp", () => {
    const label = formatTrackingDateTime("2026-09-02T11:52:00.000Z");
    expect(label).not.toBe("—");
    expect(label).toMatch(/2026/);
    expect(label.toLowerCase()).toMatch(/sep|sept|9/);
    expect(label.toLowerCase()).toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns an em dash for empty values", () => {
    expect(formatTrackingDateTime(null)).toBe("—");
    expect(formatTrackingDateTime(undefined)).toBe("—");
    expect(formatTrackingDateTime("")).toBe("—");
  });
});
