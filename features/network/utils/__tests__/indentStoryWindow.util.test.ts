import {
  INDENT_STORY_TTL_MS,
  indentStoryExpiresAt,
  isIndentStoryLive,
} from "@/features/network/utils/indentStoryWindow.util";

describe("isIndentStoryLive", () => {
  it("is false when inactive", () => {
    expect(
      isIndentStoryLive({
        is_active: false,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe(false);
  });

  it("is true for an active post with no expiry (legacy)", () => {
    expect(isIndentStoryLive({ is_active: true, expires_at: null })).toBe(true);
  });

  it("is true while expires_at is in the future", () => {
    expect(
      isIndentStoryLive({
        is_active: true,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe(true);
  });

  it("is false after expires_at", () => {
    expect(
      isIndentStoryLive({
        is_active: true,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(false);
  });
});

describe("indentStoryExpiresAt", () => {
  it("stamps 24 hours from the given instant", () => {
    const from = Date.parse("2026-08-17T12:00:00.000Z");
    expect(indentStoryExpiresAt(from)).toBe(
      new Date(from + INDENT_STORY_TTL_MS).toISOString(),
    );
  });
});
