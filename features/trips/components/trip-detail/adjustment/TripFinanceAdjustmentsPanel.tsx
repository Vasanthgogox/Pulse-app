import { memo, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { EntityAvatar } from "@/components/EntityAvatar";
import { ProvisionRevisedPartiesCard } from "@/features/trips/components/trip-detail/adjustment/ProvisionRevisedPartiesCard";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { isAdjustmentVoided } from "@/features/trips/services/tripAdjustments";

export interface TripFinanceAdjustmentsPanelProps {
  adjustments: TripAdjustment[];
  sales: number;
  adjSales: number;
  revenueSideDelta: number;
  cost: number;
  adjCost: number;
  costSideDelta: number;
  clientName: string;
  clientAvatarUrl?: string | null;
  clientAvatarSeed?: string | null;
  supplierName: string;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  lineMetaLabel: (adj: TripAdjustment) => string;
  onOpenProvision: (side: "client" | "supplier") => void;
  capturePaymentSlot?: ReactNode;
}

function cnDnLabel(impact: TripAdjustment["impact"]): string {
  return impact === "minus" ? "CN" : "DN";
}

function laneLabel(type: TripAdjustment["type"]): string {
  return type === "revenue" ? "Sale" : "Cost";
}

export const TripFinanceAdjustmentsPanel = memo(function TripFinanceAdjustmentsPanel(
  props: TripFinanceAdjustmentsPanelProps,
) {
  const rows = useMemo(
    () =>
      [...props.adjustments].sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      ),
    [props.adjustments],
  );

  const activeCount = rows.filter((a) => !isAdjustmentVoided(a)).length;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Provision adjustments</Text>
          <Text style={styles.hint}>Revised sale & cost after CN/DN lines</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeCount}</Text>
        </View>
      </View>

      <ProvisionRevisedPartiesCard
        clientName={props.clientName}
        clientAvatarUrl={props.clientAvatarUrl}
        clientAvatarSeed={props.clientAvatarSeed}
        sales={props.sales}
        adjSales={props.adjSales}
        revenueSideDelta={props.revenueSideDelta}
        supplierName={props.supplierName}
        supplierAvatarUrl={props.supplierAvatarUrl}
        supplierAvatarSeed={props.supplierAvatarSeed}
        cost={props.cost}
        adjCost={props.adjCost}
        costSideDelta={props.costSideDelta}
        onSelectSide={props.onOpenProvision}
      />

      <View style={styles.tableToolbar}>
        <Text style={styles.tableTitle}>Adjustment lines</Text>
        <View style={styles.toolbarActions}>
          <Pressable
            style={styles.addBtnSale}
            onPress={() => props.onOpenProvision("client")}
          >
            <Feather name="plus" size={12} color={Theme.primary} />
            <Text style={styles.addBtnSaleText}>Sale</Text>
          </Pressable>
          <Pressable
            style={styles.addBtnCost}
            onPress={() => props.onOpenProvision("supplier")}
          >
            <Feather name="plus" size={12} color="#0f766e" />
            <Text style={styles.addBtnCostText}>Cost</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.thParty]}>Party</Text>
          <Text style={[styles.th, styles.thLane]}>Lane</Text>
          <Text style={[styles.th, styles.thNote]}>Note</Text>
          <Text style={[styles.th, styles.thReason]}>Reason</Text>
          <Text style={[styles.th, styles.thAmt]}>Amount</Text>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.empty}>No provisions yet — tap Sale or Cost to add a CN/DN.</Text>
        ) : (
          rows.map((adj) => {
            const voided = isAdjustmentVoided(adj);
            const isSale = adj.type === "revenue";
            const partyName = isSale ? props.clientName : props.supplierName;
            return (
              <Pressable
                key={adj.id}
                style={[styles.tr, voided && styles.trVoided]}
                onPress={() => props.onOpenProvision(isSale ? "client" : "supplier")}
              >
                <View style={styles.tdParty}>
                  <EntityAvatar
                    name={partyName}
                    avatarUrl={isSale ? props.clientAvatarUrl : props.supplierAvatarUrl}
                    avatarSeed={isSale ? props.clientAvatarSeed : props.supplierAvatarSeed}
                    entityType={isSale ? "client" : "supplier"}
                    size={28}
                    showIntegrationBadge={false}
                  />
                  <Text style={[styles.partyCell, voided && styles.struck]} numberOfLines={1}>
                    {partyName}
                  </Text>
                </View>
                <Text style={[styles.td, styles.tdLane, voided && styles.struck]}>
                  {laneLabel(adj.type)}
                </Text>
                <Text
                  style={[
                    styles.td,
                    styles.tdNote,
                    adj.impact === "minus" ? styles.noteCn : styles.noteDn,
                    voided && styles.struck,
                  ]}
                >
                  {cnDnLabel(adj.impact)}
                </Text>
                <Text style={[styles.td, styles.tdReason, voided && styles.struck]} numberOfLines={2}>
                  {(adj.reason ?? "").trim() || "—"}
                </Text>
                <Text
                  style={[
                    styles.td,
                    styles.tdAmt,
                    isSale ? styles.amtSale : styles.amtCost,
                    voided && styles.struck,
                  ]}
                >
                  {adj.impact === "plus" ? "+" : "−"}
                  {formatINR(adj.amount)}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>

      {props.capturePaymentSlot}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e8ecf4",
    backgroundColor: "#fff",
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#0f172a",
  },
  hint: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  badge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#334155",
  },
  tableToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tableTitle: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  toolbarActions: { flexDirection: "row", gap: 6 },
  addBtnSale: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  addBtnSaleText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  addBtnCost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(15,118,110,0.35)",
    backgroundColor: "rgba(15,118,110,0.08)",
  },
  addBtnCostText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0f766e",
    textTransform: "uppercase",
  },
  table: {
    borderWidth: 1,
    borderColor: "#eef2f7",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fafbfc",
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  th: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  thParty: { width: "34%" },
  thLane: { width: "12%" },
  thNote: { width: "10%" },
  thReason: { flex: 1, minWidth: 0 },
  thAmt: { width: "18%", textAlign: "right" },
  empty: {
    padding: 14,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "italic",
    textAlign: "center",
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  trVoided: { opacity: 0.55 },
  td: {
    fontSize: 10,
    fontWeight: "700",
    color: "#334155",
  },
  tdParty: {
    width: "34%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  partyCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    color: "#0f172a",
    minWidth: 0,
  },
  tdLane: { width: "12%" },
  tdNote: { width: "10%", fontWeight: "900" },
  noteCn: { color: "#4f46e5" },
  noteDn: { color: "#e11d48" },
  tdReason: {
    flex: 1,
    minWidth: 0,
    fontWeight: "600",
    color: "#64748b",
    paddingRight: 4,
  },
  tdAmt: {
    width: "18%",
    textAlign: "right",
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  amtSale: { color: "#059669" },
  amtCost: { color: "#e11d48" },
  struck: {
    textDecorationLine: "line-through",
    opacity: 0.75,
  },
});
