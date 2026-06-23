import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { ProvisionFinanceLayout } from "@/features/trips/components/trip-detail/adjustment/ProvisionRevisedPartiesCard";

export interface SettlementLaneProps {
  partyName: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  isIntegrated?: boolean;
  entityType: "client" | "supplier" | "driver";
  laneLabel: string;
  revisedAmount: number;
  settledAmount: number;
  dueAmount: number;
  accentColor: string;
  onPress?: () => void;
}

function SettlementLaneCard({
  partyName,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  isIntegrated,
  entityType,
  laneLabel,
  revisedAmount,
  settledAmount,
  dueAmount,
  accentColor,
  onPress,
  layout = "mobile",
}: SettlementLaneProps & { layout?: ProvisionFinanceLayout }) {
  const isDesktop = layout === "desktop";
  const isSettled = dueAmount <= 0;
  const dueColor = isSettled ? Theme.textMuted : accentColor;
  const settledDeltaColor =
    entityType === "client" ? Theme.positive : accentColor;
  const canPreview = settledAmount > 0 && Boolean(onPress);
  const cardStyle = [
    styles.card,
    isDesktop && styles.cardDesktop,
    canPreview && styles.cardPressable,
  ];

  const content = (
    <>
      <View style={styles.cardHead}>
        <EntityAvatar
          name={partyName}
          avatarUrl={avatarUrl}
          avatarSeed={avatarSeed}
          organizationImageUrl={organizationImageUrl}
          organizationAvatarSeed={organizationAvatarSeed}
          isIntegrated={isIntegrated}
          entityType={entityType}
          size={isDesktop ? 32 : 28}
          showIntegrationBadge={false}
        />
        <View style={styles.cardHeadText}>
          <Text style={[styles.laneLabel, isDesktop && styles.laneLabelDesktop]}>
            {laneLabel}
          </Text>
          <Text
            style={[styles.partyName, isDesktop && styles.partyNameDesktop]}
            numberOfLines={2}
          >
            {partyName}
          </Text>
        </View>
      </View>
      <View style={[styles.metricsBar, isDesktop && styles.metricsBarDesktop]}>
        <View style={[styles.metricCell, isDesktop && styles.metricCellDesktop]}>
          <Text style={[styles.metricLabel, isDesktop && styles.metricLabelDesktop]}>
            Revised
          </Text>
          <Text
            style={[
              styles.metricValueMuted,
              isDesktop && styles.metricValueMutedDesktop,
            ]}
          >
            {formatINR(revisedAmount)}
          </Text>
        </View>
        <Feather
          name="arrow-right"
          size={isDesktop ? 16 : 14}
          color={Theme.textMuted}
          style={[styles.metricArrow, isDesktop && styles.metricArrowDesktop]}
        />
        <View
          style={[
            styles.metricCell,
            styles.metricCellEnd,
            isDesktop && styles.metricCellEndDesktop,
          ]}
        >
          <Text
            style={[
              styles.metricLabel,
              styles.metricLabelEnd,
              isDesktop && styles.metricLabelDesktop,
            ]}
          >
            Due
          </Text>
          <Text
            style={[
              styles.metricValueHero,
              isDesktop && styles.metricValueHeroDesktop,
              { color: dueColor },
            ]}
          >
            {isSettled ? "Settled" : formatINR(dueAmount)}
          </Text>
          <Text
            style={[
              styles.metricDeltaHero,
              isDesktop && styles.metricDeltaHeroDesktop,
              { color: settledDeltaColor },
            ]}
          >
            {settledAmount > 0 ? "−" : ""}
            {settledAmount > 0 ? formatINR(settledAmount) : "Nothing recorded"}
          </Text>
          {settledAmount > 0 ? (
            <Text
              style={[
                styles.metricSettledHint,
                styles.metricLabelEnd,
                isDesktop && styles.metricSettledHintDesktop,
              ]}
            >
              {entityType === "client" ? "Collected" : "Paid"}
            </Text>
          ) : null}
        </View>
      </View>
    </>
  );

  if (canPreview) {
    return (
      <Pressable
        style={({ pressed }) => [
          ...cardStyle,
          pressed && styles.cardPressed,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Preview ${laneLabel.toLowerCase()} transactions for ${partyName}`}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{content}</View>;
}

export interface TripPayableReceivableSummaryCardProps {
  showReceivable?: boolean;
  clientName: string;
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  clientOrganizationImageUrl?: string | null;
  clientOrganizationAvatarSeed?: string | null;
  clientIntegrated?: boolean;
  revisedReceivable: number;
  collectedAmount: number;
  receivableDue: number;
  showPayable?: boolean;
  payablePartyName: string;
  payableAvatarUrl?: string | null;
  payableAvatarSeed?: string | null;
  payableOrganizationImageUrl?: string | null;
  payableOrganizationAvatarSeed?: string | null;
  payableIntegrated?: boolean;
  payableEntityType?: "supplier" | "driver";
  payableLaneLabel?: string;
  revisedPayable: number;
  paidAmount: number;
  payableDue: number;
  layout?: ProvisionFinanceLayout;
  onPressReceivable?: () => void;
  onPressPayable?: () => void;
}

export const TripPayableReceivableSummaryCard = memo(
  function TripPayableReceivableSummaryCard(props: TripPayableReceivableSummaryCardProps) {
    const showReceivable = props.showReceivable !== false;
    const showPayable = Boolean(props.showPayable);
    const layout = props.layout ?? "mobile";
    const isDesktop = layout === "desktop";
    if (!showReceivable && !showPayable) return null;

    return (
      <View style={[styles.wrap, isDesktop && styles.wrapDesktop]}>
        {showReceivable ? (
          <SettlementLaneCard
            partyName={props.clientName}
            avatarUrl={props.clientAvatarUrl}
            avatarSeed={props.clientAvatarSeed}
            organizationImageUrl={props.clientOrganizationImageUrl}
            organizationAvatarSeed={props.clientOrganizationAvatarSeed}
            isIntegrated={props.clientIntegrated}
            entityType="client"
            laneLabel="Receivable"
            revisedAmount={props.revisedReceivable}
            settledAmount={props.collectedAmount}
            dueAmount={props.receivableDue}
            accentColor={Theme.primary}
            onPress={props.onPressReceivable}
            layout={layout}
          />
        ) : null}
        {showPayable ? (
          <SettlementLaneCard
            partyName={props.payablePartyName}
            avatarUrl={props.payableAvatarUrl}
            avatarSeed={props.payableAvatarSeed}
            organizationImageUrl={props.payableOrganizationImageUrl}
            organizationAvatarSeed={props.payableOrganizationAvatarSeed}
            isIntegrated={props.payableIntegrated}
            entityType={props.payableEntityType ?? "supplier"}
            laneLabel={props.payableLaneLabel ?? "Payable"}
            revisedAmount={props.revisedPayable}
            settledAmount={props.paidAmount}
            dueAmount={props.payableDue}
            accentColor="#0f766e"
            onPress={props.onPressPayable}
            layout={layout}
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: 4 },
  wrapDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
    marginBottom: 6,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e6edf5",
    borderRadius: 12,
    padding: 8,
    backgroundColor: "#fff",
    gap: 6,
  },
  cardDesktop: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 14,
    gap: 8,
  },
  cardPressable: {
    cursor: "pointer",
  },
  cardPressed: {
    opacity: 0.92,
    backgroundColor: Theme.surface,
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
  laneLabelDesktop: {
    fontSize: 10,
    letterSpacing: 0.7,
    lineHeight: 12,
  },
  partyName: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
    letterSpacing: -0.1,
  },
  partyNameDesktop: {
    fontSize: 13,
    lineHeight: 17,
  },
  metricsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eef2f7",
  },
  metricsBarDesktop: {
    gap: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  metricCell: { flex: 1, minWidth: 0, maxWidth: 148, gap: 3 },
  metricCellDesktop: { maxWidth: 168 },
  metricCellEnd: { alignItems: "flex-end" },
  metricCellEndDesktop: { marginLeft: "auto" as const },
  metricArrow: { flexShrink: 0 },
  metricArrowDesktop: { marginHorizontal: 2 },
  metricLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
  },
  metricLabelDesktop: {
    fontSize: 10,
    lineHeight: 12,
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
  metricValueMutedDesktop: {
    fontSize: 16,
    lineHeight: 20,
  },
  metricValueHero: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.45,
    fontVariant: ["tabular-nums"],
    lineHeight: 26,
  },
  metricValueHeroDesktop: {
    fontSize: 24,
    lineHeight: 28,
  },
  metricDeltaHero: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.15,
    lineHeight: 15,
  },
  metricDeltaHeroDesktop: {
    fontSize: 13,
    lineHeight: 16,
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
  metricSettledHintDesktop: {
    fontSize: 8,
    lineHeight: 10,
  },
});
