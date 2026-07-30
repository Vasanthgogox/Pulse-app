import {
  getAlertActions,
  UNAVAILABLE_ACTION_KINDS,
  ALERT_ACTION_CAPABILITIES,
} from "@/features/trips/domain/tripAlertActions";
import type { OperationalAlert } from "@/features/trips/domain/tripOperationalAlerts";

function alert(id: string): OperationalAlert {
  return {
    id,
    severity: "warning",
    category: "pickup",
    title: id,
    description: "",
    startedAt: "2027-01-01T00:00:00.000Z",
    isActive: true,
  };
}

describe("getAlertActions", () => {
  it("returns the recommended actions for each known alert id", () => {
    expect(getAlertActions(alert("acceptance_delayed")).map((a) => a.id)).toEqual([
      "open_trip",
      "call_driver",
      "message_driver",
    ]);
    expect(getAlertActions(alert("pickup_dwell_exceeded")).map((a) => a.id)).toEqual([
      "open_trip",
      "call_driver",
      "escalate",
    ]);
    expect(getAlertActions(alert("no_location_updates")).map((a) => a.id)).toEqual([
      "open_trip",
      "call_driver",
    ]);
  });

  it("always includes an Open Trip navigate action for an unknown alert id", () => {
    const actions = getAlertActions(alert("some_future_alert"));
    expect(actions).toEqual([{ id: "open_trip", label: "Open Trip", kind: "navigate" }]);
  });

  it("flags message/notify/escalate as unavailable, not call/navigate", () => {
    expect(UNAVAILABLE_ACTION_KINDS.has("message")).toBe(true);
    expect(UNAVAILABLE_ACTION_KINDS.has("notify")).toBe(true);
    expect(UNAVAILABLE_ACTION_KINDS.has("escalate")).toBe(true);
    expect(UNAVAILABLE_ACTION_KINDS.has("navigate")).toBe(false);
    expect(UNAVAILABLE_ACTION_KINDS.has("call")).toBe(false);
  });

  it("derives UNAVAILABLE_ACTION_KINDS from the capability matrix, not a second list", () => {
    const requiresCapability = Object.values(ALERT_ACTION_CAPABILITIES).filter(
      (c) => c.status === "requires_capability",
    );
    expect(UNAVAILABLE_ACTION_KINDS.size).toBe(requiresCapability.length);
    for (const c of requiresCapability) {
      expect(UNAVAILABLE_ACTION_KINDS.has(c.kind)).toBe(true);
    }
  });

  it("gives every requires_capability entry a concrete reason, and available entries none", () => {
    for (const capability of Object.values(ALERT_ACTION_CAPABILITIES)) {
      if (capability.status === "requires_capability") {
        expect(capability.requires).toBeTruthy();
      }
    }
    expect(ALERT_ACTION_CAPABILITIES.navigate.status).toBe("available");
    expect(ALERT_ACTION_CAPABILITIES.call.status).toBe("available");
  });
});
