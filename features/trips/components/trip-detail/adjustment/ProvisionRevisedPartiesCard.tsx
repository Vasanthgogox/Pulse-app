import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EntityAvatar } from "@/components/EntityAvatar";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";

export interface ProvisionPartyLaneProps {
  partyName: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType: "client" | "supplier";
  laneLabel: string;
  baseAmount: number;
  revisedAmount: number;
  delta: number;
  accentColor: string;
  active?: boolean;
  onPress?: () => void;
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
}: ProvisionPartyLaneProps) {
  const content = (
    <>
      <View style={styles.partyRow}>
        <EntityAvatar
          name={partyName}
          avatarUrl={avatarUrl}
          avatarSeed={avatarSeed}
          entityType={entityType}
          size={40}
          showIntegrationBadge={false}
        />
        <View style={styles.partyText}>
          <Text style={styles.laneLabel}>{laneLabel}</Text>
          <Text style={styles.partyName} numberOfLines={2}>
            {partyName}
          </Text>
        </View>
      </View>
      <View style={styles.amounts}>
        <View style={styles.amountCol}>
          <Text style={styles.amountEyebrow}>Base</Text>
          <Text style={styles.amountBase}>{formatINR(baseAmount)}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={[styles.amountCol, styles.amountColRevised]}>
          <Text style={styles.amountEyebrow}>Revised</Text>
          <Text style={[styles.amountRevised, { color: accentColor }]}>
            {formatINR(revisedAmount)}
          </Text>
          <Text style={[styles.amountDelta, { color: accentColor }]}>
            {delta >= 0 ? "+" : "−"}
            {formatINR(Math.abs(delta))}
          </Text>
        </View>
      </View>
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
  activeSide?: "client" | "supplier" | null;
  onSelectSide?: (side: "client" | "supplier") => void;
  compact?: boolean;
}

export const ProvisionRevisedPartiesCard = memo(function ProvisionRevisedPartiesCard(
  props: ProvisionRevisedPartiesCardProps,
) {
  return (
    <View style={[styles.wrap, props.compact && styles.wrapCompact]}>
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
      <PartyLaneCard
        partyName={props.supplierName}
        avatarUrl={props.supplierAvatarUrl}
        avatarSeed={props.supplierAvatarSeed}
        entityType="supplier"
        laneLabel="Revised cost"
        baseAmount={props.cost}
        revisedAmount={props.adjCost}
        delta={props.costSideDelta}
        accentColor="#0f766e"
        active={props.activeSide === "supplier"}
        onPress={props.onSelectSide ? () => props.onSelectSide!("supplier") : undefined}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  wrapCompact: { gap: 8 },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fff",
    gap: 10,
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  partyText: { flex: 1, minWidth: 0 },
  laneLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  partyName: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  amounts: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  amountCol: { flex: 1, minWidth: 0 },
  amountColRevised: { alignItems: "flex-end" },
  amountEyebrow: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    color: Theme.textMuted,
    letterSpacing: 0.5,
  },
  amountBase: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },
  arrow: {
    fontSize: 14,
    fontWeight: "300",
    color: Theme.textMuted,
    paddingBottom: 4,
  },
  amountRevised: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  amountDelta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
  },
});
