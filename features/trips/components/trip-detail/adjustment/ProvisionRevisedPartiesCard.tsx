import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { EntityAvatar } from "@/components/EntityAvatar";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";

export type ProvisionCostBreakdownLine = {
  label: string;
  amount: number;
  variant?: "default" | "section" | "child" | "emphasis" | "good";
};

const BREAKDOWN_COL_AMT = 76;

function CostBreakdownTable({
  lines,
  totalAmount,
  totalLabel = "Revised trip cost",
}: {
  lines: ProvisionCostBreakdownLine[];
  totalAmount: number;
  totalLabel?: string;
}) {
  const rowKeys = useMemo(
    () =>
      lines.map((line, index) => {
        const variant = line.variant ?? "default";
        return `${variant}-${line.label}-${line.amount}-${index}`;
      }),
    [lines],
  );

  return (
    <View style={styles.breakdownTable}>
      <View style={styles.breakdownTableHead}>
        <Text style={styles.breakdownTh} numberOfLines={1}>
          Line item
        </Text>
        <View style={styles.breakdownColAmt}>
          <Text style={[styles.breakdownTh, styles.breakdownThAmt]} numberOfLines={1}>
            Amount
          </Text>
        </View>
      </View>

      {lines.map((line, index) => {
        const variant = line.variant ?? "default";
        const isChild = variant === "child";
        const isSection = variant === "section";
        const valueColor =
          variant === "emphasis"
            ? Theme.warning
            : variant === "good"
              ? Theme.positive
              : Theme.textPrimaryDark;

        return (
          <View
            key={rowKeys[index]}
            style={[
              styles.breakdownTr,
              isSection && styles.breakdownTrSection,
              isChild && styles.breakdownTrChild,
              index === lines.length - 1 && styles.breakdownTrLast,
            ]}
          >
            <View style={styles.breakdownLabelCell}>
              {isChild ? (
                <Text style={styles.breakdownChildPrefix} accessibilityElementsHidden>
                  └
                </Text>
              ) : null}
              <Text
                style={[
                  styles.breakdownTdLabel,
                  isChild && styles.breakdownTdLabelChild,
                  isSection && styles.breakdownTdLabelSection,
                ]}
                numberOfLines={2}
              >
                {line.label}
              </Text>
            </View>
            <View style={styles.breakdownColAmt}>
              <Text
                style={[
                  styles.breakdownTdAmt,
                  { color: valueColor },
                  isSection && styles.breakdownTdAmtSection,
                ]}
                numberOfLines={1}
              >
                {formatINR(line.amount)}
              </Text>
            </View>
          </View>
        );
      })}

      <View style={styles.breakdownTableFoot}>
        <Text style={styles.breakdownFootLabel} numberOfLines={1}>
          {totalLabel}
        </Text>
        <View style={styles.breakdownColAmt}>
          <Text
            style={[
              styles.breakdownFootAmt,
              totalAmount < 0 && styles.breakdownFootAmtLoss,
            ]}
            numberOfLines={1}
          >
            {formatINR(totalAmount)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export interface ProvisionPartyLaneProps {
  partyName: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType: "client" | "supplier" | "driver";
  laneLabel: string;
  baseAmount: number;
  revisedAmount: number;
  delta: number;
  accentColor: string;
  active?: boolean;
  onPress?: () => void;
  breakdownLines?: ProvisionCostBreakdownLine[];
}

function PartyLaneCard({
  partyName,
  avatarUrl,
  avatarSeed,
  entityType,
  laneLabel,
  baseAmount,
  revisedAmount,
  delta,
  accentColor,
  active,
  onPress,
  breakdownLines,
}: ProvisionPartyLaneProps) {
  const content = (
    <>
      <View style={styles.cardHead}>
        <EntityAvatar
          name={partyName}
          avatarUrl={avatarUrl}
          avatarSeed={avatarSeed}
          entityType={entityType}
          size={28}
          showIntegrationBadge={false}
        />
        <View style={styles.cardHeadText}>
          <Text style={styles.laneLabel}>{laneLabel}</Text>
          <Text style={styles.partyName} numberOfLines={2}>
            {partyName}
          </Text>
        </View>
      </View>
      <View style={styles.metricsBar}>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Base</Text>
          <Text style={styles.metricValueMuted}>{formatINR(baseAmount)}</Text>
        </View>
        <Feather
          name="arrow-right"
          size={14}
          color={Theme.textMuted}
          style={styles.metricArrow}
        />
        <View style={[styles.metricCell, styles.metricCellEnd]}>
          <Text style={[styles.metricLabel, styles.metricLabelEnd]}>Revised</Text>
          <Text style={[styles.metricValueHero, { color: accentColor }]}>
            {formatINR(revisedAmount)}
          </Text>
          <Text
            style={[
              styles.metricDeltaHero,
              {
                color:
                  delta < 0 && entityType === "client"
                    ? Theme.negative
                    : delta > 0 && entityType !== "client"
                      ? Theme.negative
                      : accentColor,
              },
            ]}
          >
            {delta >= 0 ? "+" : "−"}
            {formatINR(Math.abs(delta))}
          </Text>
        </View>
      </View>
      {breakdownLines && breakdownLines.length > 0 ? (
        <CostBreakdownTable
          lines={breakdownLines}
          totalAmount={revisedAmount}
          totalLabel={
            laneLabel.toLowerCase().includes("cost")
              ? "Revised trip cost"
              : "Revised total"
          }
        />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.card,
          active && { borderColor: accentColor, backgroundColor: `${accentColor}0c` },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.card}>{content}</View>;
}

export interface ProvisionRevisedPartiesCardProps {
  clientName: string;
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  sales: number;
  adjSales: number;
  revenueSideDelta: number;
  supplierName: string;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  cost: number;
  adjCost: number;
  costSideDelta: number;
  /** Asset trips: driver + posted expenses instead of supplier. */
  costLaneLabel?: string;
  costPartyEntityType?: "supplier" | "driver";
  costBreakdownLines?: ProvisionCostBreakdownLine[];
  activeSide?: "client" | "supplier" | null;
  onSelectSide?: (side: "client" | "supplier") => void;
  compact?: boolean;
}

export const ProvisionRevisedPartiesCard = memo(function ProvisionRevisedPartiesCard(
  props: ProvisionRevisedPartiesCardProps,
) {
  const showClient = props.activeSide !== "supplier";
  const showSupplier = props.activeSide !== "client";

  return (
    <View style={[styles.wrap, props.compact && styles.wrapCompact]}>
      {showClient ? (
        <PartyLaneCard
          partyName={props.clientName}
          avatarUrl={props.clientAvatarUrl}
          avatarSeed={props.clientAvatarSeed}
          entityType="client"
          laneLabel="Revised sale"
          baseAmount={props.sales}
          revisedAmount={props.adjSales}
          delta={props.revenueSideDelta}
          accentColor={Theme.primary}
          active={props.activeSide === "client"}
          onPress={props.onSelectSide ? () => props.onSelectSide!("client") : undefined}
        />
      ) : null}
      {showSupplier ? (
        <PartyLaneCard
          partyName={props.supplierName}
          avatarUrl={props.supplierAvatarUrl}
          avatarSeed={props.supplierAvatarSeed}
          entityType={props.costPartyEntityType ?? "supplier"}
          laneLabel={props.costLaneLabel ?? "Revised cost"}
          baseAmount={props.cost}
          revisedAmount={props.adjCost}
          delta={props.costSideDelta}
          accentColor="#0f766e"
          active={props.activeSide === "supplier"}
          onPress={props.onSelectSide ? () => props.onSelectSide!("supplier") : undefined}
          breakdownLines={props.costBreakdownLines}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  wrapCompact: { gap: 6 },
  card: {
    borderWidth: 1,
    borderColor: "#e6edf5",
    borderRadius: 12,
    padding: 8,
    backgroundColor: "#fff",
    gap: 6,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardHeadText: { flex: 1, minWidth: 0, gap: 2 },
  laneLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
  },
  partyName: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
    letterSpacing: -0.1,
  },
  metricsBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eef2f7",
  },
  metricCell: { flex: 1, minWidth: 0, gap: 3 },
  metricCellEnd: { alignItems: "flex-end" },
  metricArrow: { flexShrink: 0, marginTop: 20 },
  metricLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
  },
  metricLabelEnd: {
    textAlign: "right",
  },
  metricValueMuted: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.25,
    lineHeight: 17,
  },
  metricValueHero: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.45,
    fontVariant: ["tabular-nums"],
    lineHeight: 26,
  },
  metricDeltaHero: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.15,
    lineHeight: 15,
  },
  breakdownTable: {
    borderWidth: 1,
    borderColor: "#eef2f7",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#fafbfc",
  },
  breakdownTableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e8ecf4",
  },
  breakdownTh: {
    ...FinanceTxnTypography.fieldLabel,
    flex: 1,
    fontSize: 8,
    lineHeight: 11,
    minWidth: 0,
  },
  breakdownThAmt: {
    textAlign: "right",
    flex: 0,
    width: "100%",
  },
  breakdownColAmt: {
    width: BREAKDOWN_COL_AMT,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  breakdownTr: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 28,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8ecf4",
    backgroundColor: "#fff",
  },
  breakdownTrSection: {
    backgroundColor: "#f8fafc",
    minHeight: 30,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  breakdownTrChild: {
    backgroundColor: "#fcfdfe",
    minHeight: 26,
  },
  breakdownTrLast: {
    borderBottomWidth: 0,
  },
  breakdownLabelCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 6,
  },
  breakdownChildPrefix: {
    fontSize: 9,
    fontWeight: "400",
    color: "#cbd5e1",
    lineHeight: 12,
    width: 8,
    flexShrink: 0,
  },
  breakdownTdLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 13,
    minWidth: 0,
  },
  breakdownTdLabelChild: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    paddingLeft: 2,
  },
  breakdownTdLabelSection: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  breakdownTdAmt: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    lineHeight: 13,
  },
  breakdownTdAmtSection: {
    fontWeight: "700",
  },
  breakdownTableFoot: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: "#f1f5f9",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  breakdownFootLabel: {
    flex: 1,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#64748b",
    lineHeight: 11,
    minWidth: 0,
    paddingRight: 6,
  },
  breakdownFootAmt: {
    width: BREAKDOWN_COL_AMT,
    fontSize: 11,
    fontWeight: "800",
    color: "#0f766e",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    letterSpacing: -0.15,
    lineHeight: 14,
  },
  breakdownFootAmtLoss: {
    color: Theme.negative,
    fontSize: 12,
    fontWeight: "900",
  },
});
