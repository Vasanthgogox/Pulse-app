/**
 * Campaign Timeline — where the campaign is in its lifecycle at a glance:
 * Published → Wave 1..3 → (Escalation) → End. Built entirely from data the
 * detail page already loads (published_at, delivery waves, expires_at);
 * the detailed Delivery panel below stays for diagnostics.
 */
import Theme from "@/constants/Theme";
import type {
  ReachCampaignRow,
  ReachCampaignDeliveryWaveRow,
} from "@/features/reach/services/campaigns.service";
import { formatRemaining } from "@/features/reach/utils/campaignFormat";
import { formatStoryDate } from "@/features/network/utils/storyDisplay";
import { CalendarClock } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";

interface TimelineStep {
  key: string;
  label: string;
  sub: string | null;
  done: boolean;
}

function buildSteps(
  campaign: ReachCampaignRow,
  waves: ReachCampaignDeliveryWaveRow[],
  bids: number,
): TimelineStep[] {
  const isActive = campaign.status === "active";
  const waveByNumber = new Map(waves.map((w) => [w.wave, w]));
  const steps: TimelineStep[] = [
    {
      key: "published",
      label: "Published",
      sub: campaign.published_at ? formatStoryDate(campaign.published_at) : null,
      done: !!campaign.published_at,
    },
  ];

  for (const n of [1, 2, 3] as const) {
    const wave = waveByNumber.get(n);
    steps.push({
      key: `wave${n}`,
      label: `Wave ${n}`,
      sub: wave
        ? `${wave.targets} org${wave.targets === 1 ? "" : "s"}`
        : isActive
          ? "Scheduled"
          : null,
      done: !!wave,
    });
  }

  // Escalation (wave 4) exists only when the no-bid push fired; show it as
  // pending only while it can still happen (active + zero bids so far).
  const escalation = waveByNumber.get(4);
  if (escalation) {
    steps.push({
      key: "escalation",
      label: "Escalation Push",
      sub: `+${escalation.targets} org${escalation.targets === 1 ? "" : "s"}`,
      done: true,
    });
  } else if (isActive && bids === 0) {
    steps.push({
      key: "escalation",
      label: "Escalation",
      sub: "If no bids arrive",
      done: false,
    });
  }

  if (campaign.status === "cancelled") {
    steps.push({ key: "end", label: "Cancelled", sub: null, done: true });
  } else if (campaign.status === "completed") {
    steps.push({
      key: "end",
      label: "Completed",
      sub: campaign.completed_at ? formatStoryDate(campaign.completed_at) : null,
      done: true,
    });
  } else {
    steps.push({
      key: "end",
      label: `Ends in ${formatRemaining(campaign.expires_at)}`,
      sub: null,
      done: false,
    });
  }

  return steps;
}

interface ReachCampaignTimelineProps {
  campaign: ReachCampaignRow;
  waves: ReachCampaignDeliveryWaveRow[];
  /** Direct bids so far — decides whether the no-bid escalation step shows. */
  bids: number;
}

export function ReachCampaignTimeline({ campaign, waves, bids }: ReachCampaignTimelineProps) {
  const steps = buildSteps(campaign, waves, bids);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}>
          <CalendarClock size={14} color={Theme.textSecondary} />
        </View>
        <Text style={styles.headerLabel}>Campaign Timeline</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.track}>
          {steps.map((step, i) => (
            <View key={step.key} style={styles.stepWrap}>
              {i > 0 ? (
                <View
                  style={[
                    styles.connector,
                    { backgroundColor: step.done ? Theme.success : Theme.borderMedium },
                  ]}
                />
              ) : null}
              <View style={styles.step}>
                <View style={[styles.dot, step.done ? styles.dotDone : styles.dotPending]}>
                  {step.done ? <View style={styles.dotCore} /> : null}
                </View>
                <Text
                  style={[styles.stepLabel, !step.done && styles.stepLabelPending]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
                {step.sub ? (
                  <Text style={styles.stepSub} numberOfLines={1}>
                    {step.sub}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const DOT = 14;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    padding: 16,
    gap: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  track: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 2 },
  stepWrap: { flexDirection: "row", alignItems: "flex-start" },
  connector: {
    width: 28,
    height: 2,
    borderRadius: 1,
    marginTop: (DOT - 2) / 2,
    marginHorizontal: 4,
  },
  step: { alignItems: "center", gap: 3, minWidth: 64, maxWidth: 110 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: { backgroundColor: Theme.positiveMuted, borderWidth: 1.5, borderColor: Theme.success },
  dotCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.success },
  dotPending: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  stepLabelPending: { color: Theme.textMuted },
  stepSub: { fontSize: 8, fontWeight: "600", color: Theme.textMuted, textAlign: "center" },
});
