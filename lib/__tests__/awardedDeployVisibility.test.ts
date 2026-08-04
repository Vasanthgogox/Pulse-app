import {
  decideDeployVisibility,
  DEPLOY_OVERDUE_ESCALATION_MS,
} from "@/features/indents/utils/awardedDeploySnooze.util";

describe("decideDeployVisibility (inbox pattern)", () => {
  const nowMs = Date.UTC(2026, 7, 4, 12, 0, 0);

  it("shows full modal for a brand-new award", () => {
    expect(
      decideDeployVisibility({
        snoozedAtMs: undefined,
        pickupDateIso: null,
        nowMs,
      }),
    ).toBe("full_modal");
  });

  it("stays quiet after dismiss — no re-interrupt on revisit", () => {
    expect(
      decideDeployVisibility({
        snoozedAtMs: nowMs - 60_000,
        pickupDateIso: new Date(nowMs + 86_400_000).toISOString(),
        nowMs,
      }),
    ).toBe("quiet");
  });

  it("does not re-open after cooldown alone", () => {
    expect(
      decideDeployVisibility({
        snoozedAtMs: nowMs - 5 * 60 * 60 * 1000,
        pickupDateIso: new Date(nowMs + 86_400_000).toISOString(),
        nowMs,
      }),
    ).toBe("quiet");
  });

  it("re-escalates only when severely overdue after dismiss", () => {
    const pickupMs = nowMs - DEPLOY_OVERDUE_ESCALATION_MS - 1_000;
    const snoozedAtMs = pickupMs + 60_000; // dismissed before overdue threshold
    expect(
      decideDeployVisibility({
        snoozedAtMs,
        pickupDateIso: new Date(pickupMs).toISOString(),
        nowMs,
      }),
    ).toBe("full_modal");
  });
});
