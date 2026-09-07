import { isMissionDebriefMessage } from "@/features/chat/utils/missionDebrief.util";

describe("isMissionDebriefMessage", () => {
  it("matches the trip-complete prompt body", () => {
    expect(
      isMissionDebriefMessage({
        message_type: "text",
        content: "Trip completed — rate this partner to close the mission debrief.",
      }),
    ).toBe(true);
  });

  it("matches feedback_request type", () => {
    expect(isMissionDebriefMessage({ message_type: "feedback_request", content: "" })).toBe(
      true,
    );
  });

  it("ignores ordinary chat", () => {
    expect(isMissionDebriefMessage({ message_type: "text", content: "On site" })).toBe(
      false,
    );
  });
});
