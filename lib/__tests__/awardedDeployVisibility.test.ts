import {
  decideDeployVisibility,
  DEPLOY_OVERDUE_ESCALATION_MS,
} from "@/features/indents/utils/awardedDeploySnooze.util";

describe("decideDeployVisibility", () => {
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

  it("demotes to peek after Later (bottom card)", () => {
    expect(
      decideDeployVisibility({
        snoozedAtMs: nowMs - 60_000,
        pickupDateIso: new Date(nowMs + 86_400_000).toISOString(),
        nowMs,
      }),
    ).toBe("peek");
  });

  it("keeps peek after cooldown alone (no modal re-pop)", () => {
    expect(
      decideDeployVisibility({
        snoozedAtMs: nowMs - 5 * 60 * 60 * 1000,
        pickupDateIso: new Date(nowMs + 86_400_000).toISOString(),
        nowMs,
      }),
    ).toBe("peek");
  });

  it("re-escalates only when severely overdue after Later", () => {
    const pickupMs = nowMs - DEPLOY_OVERDUE_ESCALATION_MS - 1_000;
    const snoozedAtMs = pickupMs + 60_000;
    expect(
      decideDeployVisibility({
        snoozedAtMs,
        pickupDateIso: new Date(pickupMs).toISOString(),
        nowMs,
      }),
    ).toBe("full_modal");
  });
});
