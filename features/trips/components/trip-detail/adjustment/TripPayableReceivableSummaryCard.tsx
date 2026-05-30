import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";

export interface SettlementLaneProps {
  partyName: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType: "client" | "supplier" | "driver";
  laneLabel: string;
  revisedAmount: number;
  settledAmount: number;
  dueAmount: number;
  accentColor: string;
}

function SettlementLaneCard({
  partyName,
  avatarUrl,
  avatarSeed,
  entityType,
  laneLabel,
  revisedAmount,
  settledAmount,
  dueAmount,
  accentColor,
}: SettlementLaneProps) {
  const isSettled = dueAmount <= 0;
  const dueColor = isSettled ? Theme.textMuted : accentColor;
  const settledDeltaColor =
    entityType === "client" ? Theme.positive : accentColor;

  return (
    <View style={styles.card}>
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
          <Text style={styles.metricLabel}>Revised</Text>
          <Text style={styles.metricValueMuted}>{formatINR(revisedAmount)}</Text>
        </View>
        <Feather
          name="arrow-right"
          size={14}
          color={Theme.textMuted}
          style={styles.metricArrow}
        />
        <View style={[styles.metricCell, styles.metricCellEnd]}>
          <Text style={[styles.metricLabel, styles.metricLabelEnd]}>Due</Text>
          <Text style={[styles.metricValueHero, { color: dueColor }]}>
            {isSettled ? "Settled" : formatINR(dueAmount)}
          </Text>
          <Text style={[styles.metricDeltaHero, { color: settledDeltaColor }]}>
            {settledAmount > 0 ? "−" : ""}
            {settledAmount > 0 ? formatINR(settledAmount) : "Nothing recorded"}
          </Text>
          {settledAmount > 0 ? (
            <Text style={[styles.metricSettledHint, styles.metricLabelEnd]}>
              {entityType === "client" ? "Collected" : "Paid"}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export interface TripPayableReceivableSummaryCardProps {
  showReceivable?: boolean;
  clientName: string;
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  revisedReceivable: number;
  collectedAmount: number;
  receivableDue: number;
  showPayable?: boolean;
  payablePartyName: string;
  payableAvatarUrl?: string | null;
  payableAvatarSeed?: string | null;
  payableEntityType?: "supplier" | "driver";
  payableLaneLabel?: string;
  revisedPayable: number;
  paidAmount: number;
  payableDue: number;
}

export const TripPayableReceivableSummaryCard = memo(
  function TripPayableReceivableSummaryCard(props: TripPayableReceivableSummaryCardProps) {
    const showReceivable = props.showReceivable !== false;
    const showPayable = Boolean(props.showPayable);
    if (!showReceivable && !showPayable) return null;

    return (
      <View style={styles.wrap}>
        {showReceivable ? (
          <SettlementLaneCard
            partyName={props.clientName}
            avatarUrl={props.clientAvatarUrl}
            avatarSeed={props.clientAvatarSeed}
            entityType="client"
            laneLabel="Receivable"
            revisedAmount={props.revisedReceivable}
            settledAmount={props.collectedAmount}
            dueAmount={props.receivableDue}
            accentColor={Theme.primary}
          />
        ) : null}
        {showPayable ? (
          <SettlementLaneCard
            partyName={props.payablePartyName}
            avatarUrl={props.payableAvatarUrl}
            avatarSeed={props.payableAvatarSeed}
            entityType={props.payableEntityType ?? "supplier"}
            laneLabel={props.payableLaneLabel ?? "Payable"}
            revisedAmount={props.revisedPayable}
            settledAmount={props.paidAmount}
            dueAmount={props.payableDue}
            accentColor="#0f766e"
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: 4 },
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
  metricSettledHint: {
    marginTop: 1,
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 9,
  },
});
