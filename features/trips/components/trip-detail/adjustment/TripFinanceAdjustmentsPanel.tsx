import { memo, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { EntityAvatar } from "@/components/EntityAvatar";
import {
  ProvisionRevisedPartiesCard,
  type ProvisionCostBreakdownLine,
} from "@/features/trips/components/trip-detail/adjustment/ProvisionRevisedPartiesCard";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { isAdjustmentVoided } from "@/features/trips/services/tripAdjustments";
import { ProvisionPassThroughCard } from "@/features/trips/components/trip-detail/adjustment/ProvisionPassThroughCard";
import {
  selectClientPassThroughRecommendations,
  type ClientPassThroughRecommendation,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentPassThrough.util";

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
  /** Asset execution: cost lane is driver labor + posted trip expenses. */
  isAssetExecution?: boolean;
  costLaneLabel?: string;
  costBreakdownLines?: ProvisionCostBreakdownLine[];
  lineMetaLabel: (adj: TripAdjustment) => string;
  onOpenProvision: (side: "client" | "supplier") => void;
  onRequestDeduction?: (rec: ClientPassThroughRecommendation) => void;
  onViewNotePdf?: (adj: TripAdjustment) => void;
  capturePaymentSlot?: ReactNode;
}

function cnDnLabel(impact: TripAdjustment["impact"]): string {
  return impact === "minus" ? "CN" : "DN";
}

function laneLabel(type: TripAdjustment["type"]): string {
  return type === "revenue" ? "Sale" : "Cost";
}

/** Fixed widths for compact columns; party + reason share remaining space. */
const COL_LANE = 38;
const COL_NOTE = 34;
const COL_AMT = 72;

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

  const passThroughRecommendations = useMemo(
    () =>
      selectClientPassThroughRecommendations({
        adjustments: props.adjustments,
        isAssetExecution: Boolean(props.isAssetExecution),
        driverOrSupplierName: props.supplierName,
      }),
    [props.adjustments, props.isAssetExecution, props.supplierName],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Provision adjustments</Text>
          <Text style={styles.hint}>
            {props.isAssetExecution
              ? "Customer sale vs driver cost & posted expenses"
              : "Revised sale & cost after CN/DN lines"}
          </Text>
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
        costLaneLabel={props.costLaneLabel}
        costPartyEntityType={props.isAssetExecution ? "driver" : "supplier"}
        costBreakdownLines={props.costBreakdownLines}
        onSelectSide={props.onOpenProvision}
      />

      {props.onRequestDeduction && passThroughRecommendations.length > 0 ? (
        <ProvisionPassThroughCard
          recommendations={passThroughRecommendations}
          isAssetExecution={Boolean(props.isAssetExecution)}
          onRequestDeduction={props.onRequestDeduction}
        />
      ) : null}

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
            <Text style={styles.addBtnCostText}>
              {props.isAssetExecution ? "Driver" : "Cost"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHead}>
          <View style={styles.colParty}>
            <Text style={styles.th} numberOfLines={1}>
              Party
            </Text>
          </View>
          <View style={styles.colLane}>
            <Text style={styles.th} numberOfLines={1}>
              Lane
            </Text>
          </View>
          <View style={styles.colNote}>
            <Text style={styles.th} numberOfLines={1}>
              Note
            </Text>
          </View>
          <View style={styles.colReason}>
            <Text style={styles.th} numberOfLines={1}>
              Reason
            </Text>
          </View>
          <View style={styles.colAmt}>
            <Text style={[styles.th, styles.thAmt]} numberOfLines={1}>
              Amount
            </Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.empty}>No provisions yet — tap Sale or Cost to add a CN/DN.</Text>
        ) : (
          rows.map((adj) => {
            const voided = isAdjustmentVoided(adj);
            const isSale = adj.type === "revenue";
            const partyName = isSale ? props.clientName : props.supplierName;
            const costEntityType = props.isAssetExecution ? "driver" : "supplier";
            return (
              <Pressable
                key={adj.id}
                style={[styles.tr, voided && styles.trVoided]}
                onPress={() => props.onOpenProvision(isSale ? "client" : "supplier")}
              >
                <View style={styles.colParty}>
                  <EntityAvatar
                    name={partyName}
                    avatarUrl={isSale ? props.clientAvatarUrl : props.supplierAvatarUrl}
                    avatarSeed={isSale ? props.clientAvatarSeed : props.supplierAvatarSeed}
                    entityType={isSale ? "client" : costEntityType}
                    size={24}
                    showIntegrationBadge={false}
                  />
                  <Text style={[styles.partyCell, voided && styles.struck]} numberOfLines={1}>
                    {partyName}
                  </Text>
                </View>
                <View style={styles.colLane}>
                  <Text style={[styles.td, styles.tdLane, voided && styles.struck]} numberOfLines={1}>
                    {laneLabel(adj.type)}
                  </Text>
                </View>
                <View style={styles.colNote}>
                  <Pressable
                    style={[
                      styles.notePill,
                      adj.impact === "minus" ? styles.notePillCn : styles.notePillDn,
                      voided && styles.notePillVoided,
                    ]}
                    onPress={() => props.onViewNotePdf?.(adj)}
                    disabled={!props.onViewNotePdf}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${cnDnLabel(adj.impact)} PDF`}
                  >
                    <Text
                      style={[
                        styles.notePillText,
                        adj.impact === "minus" ? styles.noteCn : styles.noteDn,
                        voided && styles.struck,
                      ]}
                    >
                      {cnDnLabel(adj.impact)}
                    </Text>
                    {props.onViewNotePdf ? (
                      <Feather
                        name="file-text"
                        size={9}
                        color={adj.impact === "minus" ? Theme.primary : "#0f766e"}
                        style={styles.notePillIcon}
                      />
                    ) : null}
                  </Pressable>
                </View>
                <View style={styles.colReason}>
                  <Text style={[styles.td, styles.tdReason, voided && styles.struck]} numberOfLines={2}>
                    {(adj.reason ?? "").trim() || "—"}
                  </Text>
                </View>
                <View style={styles.colAmt}>
                  <Text
                    style={[
                      styles.td,
                      styles.tdAmt,
                      isSale ? styles.amtSale : styles.amtCost,
                      voided && styles.struck,
                    ]}
                    numberOfLines={1}
                  >
                    {adj.impact === "plus" ? "+" : "−"}
                    {formatINR(adj.amount)}
                  </Text>
                </View>
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
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  thAmt: {
    textAlign: "right",
    width: "100%",
  },
  colParty: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingRight: 6,
  },
  colLane: {
    width: COL_LANE,
    flexShrink: 0,
    justifyContent: "center",
  },
  colNote: {
    width: COL_NOTE,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  colReason: {
    flex: 1,
    minWidth: 48,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  colAmt: {
    width: COL_AMT,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
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
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  trVoided: { opacity: 0.55 },
  td: {
    fontSize: 11,
    fontWeight: "500",
    color: "#334155",
  },
  tdLane: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
  },
  partyCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#0f172a",
    minWidth: 0,
  },
  notePill: {
    minWidth: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
  },
  notePillIcon: {
    marginTop: 1,
  },
  notePillCn: {
    backgroundColor: "rgba(79,70,229,0.1)",
  },
  notePillDn: {
    backgroundColor: "rgba(225,29,72,0.08)",
  },
  notePillVoided: {
    opacity: 0.7,
  },
  notePillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  noteCn: { color: "#4f46e5" },
  noteDn: { color: "#e11d48" },
  tdReason: {
    fontWeight: "500",
    color: "#64748b",
  },
  tdAmt: {
    fontSize: 11,
    textAlign: "right",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  amtSale: { color: "#059669" },
  amtCost: { color: "#dc2626" },
  struck: {
    textDecorationLine: "line-through",
    opacity: 0.75,
  },
});
