/**
 * Tiny unit tests for experience milestone sequencing.
 * Run: npx jest features/experience/__tests__/experienceProgress.test.ts
 */
import {
  computeExperienceProgress,
  countFiveStarRatings,
  getMilestoneCount,
  isMilestoneCompleted,
  isMilestoneInProgress,
} from "@/features/experience/experienceProgress";

describe("experienceProgress", () => {
  it("counts five-star ratings only", () => {
    expect(
      countFiveStarRatings([{ score: 5 }, { score: 4 }, { score: 5 }]),
    ).toBe(2);
  });

  it("starts at Initiate when signed up with no trips", () => {
    const p = computeExperienceProgress({
      hasSignedUp: true,
      completedTrips: 0,
      isVerified: false,
      fiveStarCount: 0,
    });
    // Level 1 signup is met → working on level 2 (Novice / 2 trips)
    expect(p.highestCompletedLevel).toBe(1);
    expect(p.currentLevel).toBe(2);
    expect(p.currentLevelConfig.name).toBe("Novice");
    expect(p.currentCount).toEqual({ done: 0, target: 2, pct: 0 });
    expect(isMilestoneCompleted(1, p)).toBe(true);
    expect(isMilestoneInProgress(2, p)).toBe(true);
  });

  it("advances through trips and blocks on verification", () => {
    const p = computeExperienceProgress({
      hasSignedUp: true,
      completedTrips: 5,
      isVerified: false,
      fiveStarCount: 0,
    });
    // L1 signup + L2 trips(2) met → stuck on L3 verification
    expect(p.highestCompletedLevel).toBe(2);
    expect(p.currentLevel).toBe(3);
    expect(p.currentLevelConfig.type).toBe("verification");
    expect(getMilestoneCount(p.currentLevelConfig, p.metrics).pct).toBe(0);
  });

  it("clears verification and ratings gates with real metrics", () => {
    const p = computeExperienceProgress({
      hasSignedUp: true,
      completedTrips: 30,
      isVerified: true,
      fiveStarCount: 20,
    });
    expect(p.highestCompletedLevel).toBe(8);
    expect(p.currentLevel).toBe(8);
    expect(p.experiencePct).toBe(100);
    expect(isMilestoneInProgress(8, p)).toBe(false);
  });
});
