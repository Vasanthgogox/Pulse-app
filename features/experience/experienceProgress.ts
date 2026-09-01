/**
 * Experience milestone progress — single source of truth for driver + business
 * Experience Roadmap / Next Mile Objectives.
 *
 * Levels and goals come from `constants/DriverLevels.ts` (`LEVELS_CONFIG`).
 * Progress is sequential: you stay on the first unmet milestone.
 */
import { LEVELS_CONFIG } from "@/constants/DriverLevels";

export type ExperienceLevelConfig = (typeof LEVELS_CONFIG)[number];
export type ExperienceGoalType = ExperienceLevelConfig["type"];

export type ExperienceMetrics = {
  /** Signed-in / onboarded. */
  hasSignedUp: boolean;
  /** Completed / delivered / done trips (cumulative). */
  completedTrips: number;
  /** KYC verified (driver) or workspace established (business). */
  isVerified: boolean;
  /** Count of five-star ratings received. */
  fiveStarCount: number;
};

export type MilestoneCount = {
  done: number;
  target: number;
  pct: number;
};

export type ExperienceProgress = {
  currentLevel: number;
  currentLevelConfig: ExperienceLevelConfig;
  nextLevelConfig: ExperienceLevelConfig | null;
  /** 0–100 progress within the current milestone goal. */
  experiencePct: number;
  currentCount: MilestoneCount;
  /** Highest fully completed level (0 if none). */
  highestCompletedLevel: number;
  metrics: ExperienceMetrics;
  levels: readonly ExperienceLevelConfig[];
};

export function countFiveStarRatings(
  ratings: readonly { score: number }[] | null | undefined,
): number {
  if (!ratings?.length) return 0;
  return ratings.reduce((n, r) => n + (r.score >= 5 ? 1 : 0), 0);
}

export function isExperienceGoalMet(
  level: Pick<ExperienceLevelConfig, "type" | "target">,
  metrics: ExperienceMetrics,
): boolean {
  switch (level.type) {
    case "signup":
      return metrics.hasSignedUp;
    case "trips":
      return metrics.completedTrips >= level.target;
    case "verification":
      return metrics.isVerified;
    case "ratings":
      return metrics.fiveStarCount >= level.target;
    default:
      return false;
  }
}

export function getMilestoneCount(
  level: Pick<ExperienceLevelConfig, "type" | "target">,
  metrics: ExperienceMetrics,
): MilestoneCount {
  const target = Math.max(1, level.target);
  let done = 0;
  switch (level.type) {
    case "signup":
      done = metrics.hasSignedUp ? 1 : 0;
      break;
    case "trips":
      done = Math.min(metrics.completedTrips, target);
      break;
    case "verification":
      done = metrics.isVerified ? 1 : 0;
      break;
    case "ratings":
      done = Math.min(metrics.fiveStarCount, target);
      break;
    default:
      done = 0;
  }
  return {
    done,
    target,
    pct: Math.min(100, Math.floor((done / target) * 100)),
  };
}

/**
 * Sequential experience: current level = first unmet milestone (or max when all done).
 */
export function computeExperienceProgress(
  metrics: ExperienceMetrics,
): ExperienceProgress {
  const levels = LEVELS_CONFIG;
  let highestCompletedLevel = 0;

  for (const level of levels) {
    if (isExperienceGoalMet(level, metrics)) {
      highestCompletedLevel = level.level;
    } else {
      break;
    }
  }

  const maxLevel = levels[levels.length - 1]?.level ?? 1;
  const currentLevel =
    highestCompletedLevel >= maxLevel
      ? maxLevel
      : Math.min(maxLevel, highestCompletedLevel + 1);

  const currentLevelConfig =
    levels.find((l) => l.level === currentLevel) ?? levels[0]!;
  const nextLevelConfig =
    levels.find((l) => l.level === currentLevel + 1) ?? null;

  const currentCount = getMilestoneCount(currentLevelConfig, metrics);
  const allDone = highestCompletedLevel >= maxLevel;
  const experiencePct = allDone ? 100 : currentCount.pct;

  return {
    currentLevel,
    currentLevelConfig,
    nextLevelConfig,
    experiencePct,
    currentCount,
    highestCompletedLevel,
    metrics,
    levels,
  };
}

export function isMilestoneCompleted(
  level: number,
  progress: ExperienceProgress,
): boolean {
  return level <= progress.highestCompletedLevel;
}

/** First unmet milestone (false when current level is already fully cleared). */
export function isMilestoneInProgress(
  level: number,
  progress: ExperienceProgress,
): boolean {
  return (
    level === progress.currentLevel &&
    level > progress.highestCompletedLevel
  );
}

export function formatExperienceMilestoneTitle(
  config: Pick<ExperienceLevelConfig, "level" | "name">,
): string {
  return `L${config.level} ${config.name}`;
}

export function formatExperienceTierSubtitle(
  config: Pick<ExperienceLevelConfig, "tier" | "privilege">,
): string {
  return `${config.tier} tier · Unlocks ${config.privilege}`;
}

/** Label for the active milestone bar (never the *next* level name). */
export function formatMilestoneProgressLabel(
  progress: ExperienceProgress,
): string {
  const maxLevel = progress.levels[progress.levels.length - 1]?.level ?? 1;
  if (progress.highestCompletedLevel >= maxLevel) {
    return "All milestones complete";
  }
  return `Progress on ${progress.currentLevelConfig.name}`;
}

/** One-line status for the current milestone goal (type-aware metrics). */
export function formatMilestoneStatusLine(
  level: Pick<ExperienceLevelConfig, "type" | "goalText">,
  count: MilestoneCount,
  metrics: ExperienceMetrics,
  options?: { audience?: "business" | "driver" },
): string {
  const audience = options?.audience ?? "driver";
  switch (level.type) {
    case "signup":
      return count.done >= count.target ? "Signup complete" : "Complete signup to continue";
    case "trips":
      return `${count.done}/${count.target} trips completed`;
    case "verification":
      return metrics.isVerified
        ? audience === "business"
          ? "Business identity verified"
          : "Identity verified"
        : audience === "business"
          ? "Complete business verification"
          : "Complete identity verification";
    case "ratings":
      return audience === "business"
        ? `${count.done}/${count.target} five-star partner ratings`
        : `${count.done}/${count.target} five-star ratings`;
    default:
      return level.goalText;
  }
}
