import type { DiscoverOrg } from "@/features/network/services/discover.service";

export type RecommendationSignal = {
  type: "mutual" | "location" | "lane";
  label: string;
};

export type ScoredDiscoverOrg = DiscoverOrg & {
  score: number;
  signals: RecommendationSignal[];
};

export function getDiscoverOrgLocation(org: DiscoverOrg): string | null {
  const cityState = [org.city, org.state]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ")
    .trim();
  if (cityState) return cityState;

  const direct =
    org.business_location ??
    org.location ??
    org.headquarters ??
    (org.address_line?.trim() ? org.address_line.trim() : null) ??
    null;
  if (direct && direct.trim()) {
    const parts = direct
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
    return direct.trim();
  }
  return null;
}

/** Maps RPC-enriched discover row to scored card model (DB already sorted). */
export function scoreDiscoverOrg(org: DiscoverOrg): ScoredDiscoverOrg {
  const signals: RecommendationSignal[] = [];
  const mutuals = org.mutual_count ?? org.mutual_connections_count ?? 0;
  const laneOverlaps = org.lane_overlap_count ?? 0;

  if (mutuals > 0) {
    signals.push({
      type: "mutual",
      label: `${mutuals} mutual${mutuals === 1 ? "" : "s"}`,
    });
  }
  if (laneOverlaps >= 2) {
    signals.push({
      type: "lane",
      label: `${laneOverlaps} lane overlaps`,
    });
  } else if (laneOverlaps >= 1 || org.is_in_user_trip_city) {
    signals.push({ type: "location", label: "Active on your routes" });
  }

  const score =
    typeof org.recommendation_score === "number"
      ? org.recommendation_score
      : signals.length === 0
        ? -1
        : 0;

  return { ...org, score, signals };
}

export function isConnectableDiscoverOrg(org: ScoredDiscoverOrg): boolean {
  const status = String(org.connection_status ?? "none").toLowerCase();
  const role = String(org.profile_role ?? "").toLowerCase();
  return status !== "approved" && role !== "driver";
}

export function pickGrowRecommendations(
  orgs: readonly DiscoverOrg[],
  opts: { limit: number; dismissed?: ReadonlySet<string> },
): ScoredDiscoverOrg[] {
  const scored = orgs.map(scoreDiscoverOrg).filter(isConnectableDiscoverOrg);
  const signalRecommended = scored.filter((o) => o.score > 0);
  const pool = signalRecommended.length > 0 ? signalRecommended : scored;

  const slots: ScoredDiscoverOrg[] = [];
  for (const org of pool) {
    if (opts.dismissed?.has(org.id)) continue;
    slots.push(org);
    if (slots.length >= opts.limit) break;
  }
  return slots;
}

export function primaryRecommendationReason(
  signals: readonly RecommendationSignal[],
): string | null {
  const lane = signals.find((s) => s.type === "lane");
  if (lane) return lane.label;
  const location = signals.find((s) => s.type === "location");
  if (location) return location.label;
  const mutual = signals.find((s) => s.type === "mutual");
  if (mutual) return mutual.label;
  return null;
}

export type RecommendationPillTone = "lane" | "location" | "mutual" | "default";

export type RecommendationPill = {
  label: string;
  tone: RecommendationPillTone;
};

export function recommendationPills(
  signals: readonly RecommendationSignal[],
): RecommendationPill[] {
  if (signals.length === 0) {
    return [{ label: "Suggested partner", tone: "default" }];
  }
  return signals.map((signal) => ({
    label: signal.label,
    tone: signal.type,
  }));
}

/** One-line match copy for sidebar rows — avoids duplicating pill labels. */
export function growRowMatchLine(signals: readonly RecommendationSignal[]): {
  prefix: string;
  highlight: string;
  tone: RecommendationPillTone;
} {
  const lane = signals.find((s) => s.type === "lane");
  if (lane) {
    return { prefix: "Strong fit · ", highlight: lane.label, tone: "lane" };
  }
  const location = signals.find((s) => s.type === "location");
  if (location) {
    return {
      prefix: "Route match · ",
      highlight: location.label,
      tone: "location",
    };
  }
  const mutual = signals.find((s) => s.type === "mutual");
  if (mutual) {
    return { prefix: "Network · ", highlight: mutual.label, tone: "mutual" };
  }
  return {
    prefix: "",
    highlight: "Suggested partner",
    tone: "default",
  };
}

export function growRowAccentColor(tone: RecommendationPillTone): string {
  if (tone === "lane") return "#7239EA";
  if (tone === "location") return "#3E97FF";
  if (tone === "mutual") return "#50CD89";
  return "#A1A5B7";
}
