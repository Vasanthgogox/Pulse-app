import {
  formatStoryDate,
  formatStoryDateTime,
  formatStoryDateTimeWithFallback,
} from "@/features/network/utils/storyDisplay";

/** 07 Sept 2026, 2:32 pm IST. */
const IST_1432 = "2026-09-07T09:02:00.000Z";
/** 08 Sept 2026, 12:00 am IST (previous IST calendar day vs 07 Sept pickup). */
const NEXT_IST_DAY = "2026-09-07T18:30:00.000Z";

describe("formatStoryDateTime", () => {
  it("keeps a date-only pickup as a date with no clock", () => {
    expect(formatStoryDateTime("2026-09-07")).toBe(formatStoryDate("2026-09-07"));
    expect(formatStoryDateTime("2026-09-07")).not.toMatch(/·/);
  });

  it("appends IST clock time after a real timestamp", () => {
    const label = formatStoryDateTime(IST_1432);
    expect(label).toMatch(/07 Sep/i);
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/·/);
    expect(label).toMatch(/2:32/i);
  });
});

describe("formatStoryDateTimeWithFallback", () => {
  it("appends created_at time when pickup is date-only", () => {
    const label = formatStoryDateTimeWithFallback("2026-09-07", IST_1432);
    expect(label).toMatch(/07 Sep/i);
    expect(label).toMatch(/·/);
    expect(label).toMatch(/2:32/i);
  });

  it("still appends a real clock when created_at is a different IST day", () => {
    const label = formatStoryDateTimeWithFallback("2026-09-07", NEXT_IST_DAY);
    expect(label).toMatch(/07 Sep/i);
    expect(label).toMatch(/·/);
    expect(label).toMatch(/12:00/i);
  });

  it("formats a timestamp primary without needing a fallback", () => {
    expect(formatStoryDateTimeWithFallback(IST_1432, null)).toBe(
      formatStoryDateTime(IST_1432),
    );
  });
});
