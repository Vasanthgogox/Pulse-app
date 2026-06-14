/**
 * Pulse Scan OCR usage dashboard — org-scoped metrics from get_ocr_metrics RPC.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import {
  WORKSPACE_PANEL_SUBTITLES,
  WORKSPACE_PANEL_TITLES,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import {
  PURPLE,
  PURPLE_BORDER,
  PURPLE_TINT,
  SectionHeader,
  workspacePanelStyles as panelStyles,
} from "@/features/organization/components/workspace/workspacePanelUi";
import { useOcrMetricsQuery, EMPTY_OCR_METRICS } from "@/lib/queries/useOcrMetricsQuery";
import { ScanLine } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onBack: () => void;
};

function formatPercent(confidence: number | null): string {
  if (confidence == null || !Number.isFinite(confidence)) return "—";
  return `${Math.round(confidence * 100)}%`;
}

function formatQuotaRemaining(remaining: number | null, limit: number | null): string {
  if (limit == null) return "Unlimited";
  if (remaining == null) return "—";
  return `${remaining.toLocaleString("en-IN")} left`;
}

function formatTierLabel(tier: string): string {
  switch (tier) {
    case "invoice_pro":
      return "Invoice Pro";
    case "pulse_core":
      return "Pulse Core";
    default:
      return tier.replace(/_/g, " ");
  }
}

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <View style={[styles.metricCard, accent ? { borderColor: accent } : null]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

export function WorkspaceOcrUsagePanel({ onBack }: Props) {
  const { data: metrics = EMPTY_OCR_METRICS, isLoading, isError, refetch, isFetching } =
    useOcrMetricsQuery();

  const quotaLine =
    metrics.quota_limit != null
      ? `${metrics.quota_used.toLocaleString("en-IN")} / ${metrics.quota_limit.toLocaleString("en-IN")} scans this month`
      : `${metrics.quota_used.toLocaleString("en-IN")} scans this month · unlimited plan`;

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES["ocr-usage"]}
      subtitle={WORKSPACE_PANEL_SUBTITLES["ocr-usage"]}
      onBack={onBack}
      rightSlot={
        <Pressable
          onPress={() => void refetch()}
          accessibilityRole="button"
          accessibilityLabel="Refresh OCR metrics"
          style={styles.refreshBtn}
        >
          <Text style={styles.refreshText}>{isFetching ? "Refreshing…" : "Refresh"}</Text>
        </Pressable>
      }
    >
      <View style={panelStyles.card}>
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <ScanLine size={20} color={PURPLE} strokeWidth={1.8} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Pulse Scan Engine</Text>
            <Text style={styles.heroSubtitle}>{formatTierLabel(metrics.quota_tier)} · {quotaLine}</Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <LoadingIndicator />
        </View>
      ) : isError ? (
        <View style={panelStyles.card}>
          <Text style={styles.errorText}>Could not load OCR metrics. Pull to refresh or try again.</Text>
        </View>
      ) : (
        <>
          <View style={panelStyles.card}>
            <SectionHeader label="Usage" />
            <View style={styles.metricGrid}>
              <MetricCard label="Scans today" value={String(metrics.jobs_today)} />
              <MetricCard
                label="Scans this month"
                value={String(metrics.jobs_this_month)}
                hint="Billable scans (excludes dedup copies)"
              />
              <MetricCard
                label="Quota remaining"
                value={formatQuotaRemaining(metrics.quota_remaining, metrics.quota_limit)}
                accent={PURPLE_BORDER}
              />
              <MetricCard
                label="30-day window"
                value={String(metrics.jobs_in_window)}
                hint="All job rows created"
              />
            </View>
          </View>

          <View style={panelStyles.card}>
            <SectionHeader label="Quality & efficiency" />
            <View style={styles.metricGrid}>
              <MetricCard
                label="Duplicate scans avoided"
                value={String(metrics.duplicate_count)}
                hint="Fingerprint cache hits"
              />
              <MetricCard label="Failed scans" value={String(metrics.failed_count)} />
              <MetricCard
                label="Average confidence"
                value={formatPercent(metrics.avg_confidence)}
                hint="Completed jobs (30d)"
              />
              <MetricCard
                label="Avg processing"
                value={
                  metrics.avg_duration_ms != null
                    ? `${(metrics.avg_duration_ms / 1000).toFixed(1)}s`
                    : "—"
                }
              />
            </View>
          </View>
        </>
      )}
    </WorkspaceDetailLayout>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: PURPLE_TINT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 4,
  },
  metricCard: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 140,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  metricHint: {
    marginTop: 6,
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    color: Theme.destructive,
    lineHeight: 20,
  },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: "600",
    color: PURPLE,
  },
});
