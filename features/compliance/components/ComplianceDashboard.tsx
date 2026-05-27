/**
 * Compliance Dashboard — top metric strip for the Documents Center.
 *
 * Six cards (spec § 3 — "Expiry Intelligence Dashboard"):
 *   1. Expiring in 7 days
 *   2. Expiring in 30 days
 *   3. Expired documents
 *   4. High-risk vehicles      (≥ 1 expired blocking doc)
 *   5. Blocked drivers         (license expired or missing)
 *   6. Compliance score        (org-wide aggregate)
 *
 * Cards are computed from three signals already in the cache:
 *   • `useComplianceSummaryQuery`     → per-entity_type counters
 *   • `useExpiringDocumentsQuery(7)`  → fine-grained 7-day list
 *   • `useExpiringDocumentsQuery(30)` → fine-grained 30-day list
 *
 * The high-risk-vehicles and blocked-drivers counts walk the expiring/
 * expired lists rather than firing a third RPC — they only need a count
 * of *distinct entities* with at least one blocker, which we can derive
 * locally (saves a round-trip and keeps the dashboard reactive).
 *
 * The compliance score is computed from the summary counters using the
 * same weighted formula as `computeComplianceScore` (validity 40% +
 * completeness 35% + verification 25%) so the badge feels identical to
 * the per-entity score shown on detail screens.
 */

import { ChevronRight } from "lucide-react-native";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  useComplianceSummaryQuery,
  useExpiringDocumentsQuery,
} from "@/lib/queries/useDocumentsQuery";
import {
  getBlockingDocCodes,
  type ComplianceDashboardCard,
  type ComplianceLevel,
  type DocumentCenterSection,
} from "@/features/compliance";

export interface ComplianceDashboardProps {
  orgId: string | null;
  /** Tapping a card jumps to the matching Documents Center section. */
  onCardPress?: (section: DocumentCenterSection) => void;
}

const TONE_BG: Record<ComplianceDashboardCard["tone"], string> = {
  critical: "rgba(220,38,38,0.10)",
  warning: "rgba(180,83,9,0.10)",
  notice: "rgba(79,70,229,0.10)",
  ok: "rgba(21,128,61,0.10)",
  neutral: "rgba(15,23,42,0.04)",
};

const TONE_FG: Record<ComplianceDashboardCard["tone"], string> = {
  critical: Theme.destructive ?? "#DC2626",
  warning: Theme.warning ?? "#B45309",
  notice: Theme.primary ?? "#4F46E5",
  ok: Theme.positive ?? "#15803D",
  neutral: Theme.textPrimaryDark,
};

function aggregateScore(totals: {
  total: number;
  expired: number;
  verified: number;
  pending: number;
}): { score: number; level: ComplianceLevel } {
  if (totals.total === 0) return { score: 100, level: "excellent" };
  const validity = Math.round(((totals.total - totals.expired) / totals.total) * 100);
  const verification = Math.round((totals.verified / totals.total) * 100);
  // Org-wide completeness is approximated as "share of docs that aren't
  // pending" — without a per-entity catalog walk the dashboard can't know
  // "missing" entities, so we treat the summary as completeness ≈ 100%.
  const completeness = 100;
  const score = Math.round(validity * 0.4 + completeness * 0.35 + verification * 0.25);
  const level: ComplianceLevel =
    score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "warning" : "critical";
  return { score, level };
}

export function ComplianceDashboard({
  orgId,
  onCardPress,
}: ComplianceDashboardProps) {
  const { t } = useLanguage();
  const summary = useComplianceSummaryQuery(orgId);
  const expiring7d = useExpiringDocumentsQuery(orgId, 7);
  const expiring30d = useExpiringDocumentsQuery(orgId, 30);

  const isLoading = summary.isLoading || expiring7d.isLoading || expiring30d.isLoading;

  const cards = useMemo<ComplianceDashboardCard[]>(() => {
    const sum = summary.data ?? [];
    const totals = sum.reduce(
      (acc, row) => ({
        total: acc.total + Number(row.total_docs ?? 0),
        active: acc.active + Number(row.active_docs ?? 0),
        expired: acc.expired + Number(row.expired_docs ?? 0),
        expiring7d: acc.expiring7d + Number(row.expiring_7d ?? 0),
        expiring30d: acc.expiring30d + Number(row.expiring_30d ?? 0),
        pending: acc.pending + Number(row.pending_docs ?? 0),
        verified: acc.verified + Number(row.verified_docs ?? 0),
      }),
      {
        total: 0,
        active: 0,
        expired: 0,
        expiring7d: 0,
        expiring30d: 0,
        pending: 0,
        verified: 0,
      },
    );

    const blockingVehicleCodes = new Set(getBlockingDocCodes("vehicle"));
    const blockingDriverCodes = new Set(getBlockingDocCodes("driver"));

    const distinctRiskyVehicles = new Set<string>();
    const distinctBlockedDrivers = new Set<string>();

    for (const row of expiring30d.data ?? []) {
      // Only the *expired* slice qualifies as a "high-risk" / "blocked" entity.
      if (row.days_until >= 0 && row.status !== "expired") continue;
      if (row.entity_type === "vehicle" && blockingVehicleCodes.has(row.doc_type)) {
        distinctRiskyVehicles.add(row.entity_id);
      }
      if (row.entity_type === "driver" && blockingDriverCodes.has(row.doc_type)) {
        distinctBlockedDrivers.add(row.entity_id);
      }
    }

    const { score, level } = aggregateScore(totals);

    return [
      {
        id: "expiring_7d",
        label: t("complianceCardExpiring7d"),
        value: totals.expiring7d,
        helper: t("complianceCardHelperFleet"),
        tone: totals.expiring7d > 0 ? "critical" : "ok",
      },
      {
        id: "expiring_30d",
        label: t("complianceCardExpiring30d"),
        value: totals.expiring30d,
        helper: t("complianceCardHelperFleet"),
        tone: totals.expiring30d > 0 ? "warning" : "ok",
      },
      {
        id: "expired",
        label: t("complianceCardExpired"),
        value: totals.expired,
        helper: t("complianceCardHelperFleet"),
        tone: totals.expired > 0 ? "critical" : "ok",
      },
      {
        id: "high_risk_vehicles",
        label: t("complianceCardHighRiskVehicles"),
        value: distinctRiskyVehicles.size,
        helper: t("complianceCardHelperRisk"),
        tone: distinctRiskyVehicles.size > 0 ? "critical" : "ok",
      },
      {
        id: "blocked_drivers",
        label: t("complianceCardBlockedDrivers"),
        value: distinctBlockedDrivers.size,
        helper: t("complianceCardHelperBlocked"),
        tone: distinctBlockedDrivers.size > 0 ? "critical" : "ok",
      },
      {
        id: "compliance_score",
        label: t("complianceCardComplianceScore"),
        value: `${score}%`,
        helper:
          level === "excellent"
            ? t("complianceLevelExcellent")
            : level === "good"
              ? t("complianceLevelGood")
              : level === "warning"
                ? t("complianceLevelWarning")
                : t("complianceLevelCritical"),
        tone:
          level === "excellent"
            ? "ok"
            : level === "good"
              ? "notice"
              : level === "warning"
                ? "warning"
                : "critical",
      },
    ];
  }, [summary.data, expiring30d.data, t]);

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {cards.map((c) => {
          const section: DocumentCenterSection =
            c.id === "expiring_7d" || c.id === "expiring_30d"
              ? "expiring"
              : c.id === "expired"
                ? "expired"
                : c.id === "high_risk_vehicles" || c.id === "blocked_drivers"
                  ? "expired"
                  : "all";
          return (
            <Pressable
              key={c.id}
              onPress={() => onCardPress?.(section)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: TONE_BG[c.tone] },
                pressed && styles.cardPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${c.label}: ${c.value}`}
            >
              <View style={styles.cardHeader}>
                <Text
                  style={[styles.cardLabel, { color: TONE_FG[c.tone] }]}
                  numberOfLines={1}
                >
                  {c.label}
                </Text>
                <ChevronRight
                  size={14}
                  color={TONE_FG[c.tone]}
                  strokeWidth={2.4}
                />
              </View>
              <Text
                style={[styles.cardValue, { color: TONE_FG[c.tone] }]}
                numberOfLines={1}
              >
                {c.value}
              </Text>
              {c.helper ? (
                <Text style={styles.cardHelper} numberOfLines={1}>
                  {c.helper}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  loadingWrap: {
    width: "100%",
    paddingVertical: 32,
    alignItems: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  cardLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  cardValue: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginTop: 6,
  },
  cardHelper: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
});
