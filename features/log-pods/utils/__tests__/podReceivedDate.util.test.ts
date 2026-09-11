import {
  calendarDateAtNoon,
  formatPodReceivedDateLabel,
  podReceivedAtIso,
} from "../podReceivedDate.util";

describe("POD received date presets", () => {
  const now = new Date("2026-09-12T18:30:00+05:30");

  it("today is local noon on the same calendar day", () => {
    const date = calendarDateAtNoon("today", now);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(12);
    expect(date.getHours()).toBe(12);
  });

  it("yesterday is the previous calendar day", () => {
    const date = calendarDateAtNoon("yesterday", now);
    expect(date.getDate()).toBe(11);
    expect(formatPodReceivedDateLabel("yesterday", now)).toContain("11");
  });

  it("emits an ISO timestamp", () => {
    expect(podReceivedAtIso("today", now)).toMatch(/T/);
  });
});
