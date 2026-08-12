import { memo, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { EntityAvatar } from "@/components/EntityAvatar";
import {
  ProvisionRevisedPartiesCard,
  type ProvisionCostBreakdownLine,
  type ProvisionFinanceLayout,
} from "@/features/trips/components/trip-detail/adjustment/ProvisionRevisedPartiesCard";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
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
  clientOrganizationImageUrl?: string | null;
  clientOrganizationAvatarSeed?: string | null;
  clientIntegrated?: boolean;
  supplierName: string;
  supplierAvatarUrl?: string | null;
  supplierAvatarSeed?: string | null;
  supplierOrganizationImageUrl?: string | null;
  supplierOrganizationAvatarSeed?: string | null;
  supplierIntegrated?: boolean;
  /** Asset execution: cost lane is driver labor + posted trip expenses. */
  isAssetExecution?: boolean;
  costLaneLabel?: string;
  costBreakdownLines?: ProvisionCostBreakdownLine[];
  /** True when the supplier/cost rate was never entered on the trip (renders "Not set" instead of a false ₹0). */
  costUnset?: boolean;
  lineMetaLabel: (adj: TripAdjustment) => string;
  /**
   * False hides the +Sale / +Cost toolbar for a viewer without
   * `finance.void_adjustments`. Defaults to true so existing callers are
   * unchanged. The modal itself is separately gated in useTripDetail.
   */
  canAddAdjustment?: boolean;
  onOpenProvision: (side: "client" | "supplier") => void;
  onRequestDeduction?: (rec: ClientPassThroughRecommendation) => void;
  onViewNotePdf?: (adj: TripAdjustment) => void;
  onEditAdjustment?: (adj: TripAdjustment) => void;
  capturePaymentSlot?: ReactNode;
  layout?: ProvisionFinanceLayout;
}

function cnDnLabel(impact: TripAdjustment["impact"]): string {
  return impact === "minus" ? "CN" : "DN";
}

function laneLabel(type: TripAdjustment["type"]): string {
  return type === "revenue" ? "Sale" : "Cost";
}

/** Fixed widths for compact columns; party+lane and reason share flexible space. */
const COL_NOTE = 40;
const COL_AMT = 78;

export const TripFinanceAdjustmentsPanel = memo(function TripFinanceAdjustmentsPanel(
  props: TripFinanceAdjustmentsPanelProps,
) {
  const rows = useMemo(
    () =>
      [...(Array.isArray(props.adjustments) ? props.adjustments : [])].sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      ),
    [props.adjustments],
  );

  const activeCount = rows.filter((a) => !isAdjustmentVoided(a)).length;
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const layout = props.layout ?? "mobile";
  const isDesktop = layout === "desktop";
  const colAmt = isDesktop ? 92 : COL_AMT;

  const passThroughRecommendations = useMemo(
    () =>
      selectClientPassThroughRecommendations({
        adjustments: Array.isArray(props.adjustments) ? props.adjustments : [],
        isAssetExecution: Boolean(props.isAssetExecution),
        driverOrSupplierName: props.supplierName,
      }),
    [props.adjustments, props.isAssetExecution, props.supplierName],
  );

  return (
    <View style={[styles.card, isDesktop && styles.cardDesktop]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, isDesktop && styles.titleDesktop]}>
            Provision adjustments
          </Text>
          <Text style={[styles.hint, isDesktop && styles.hintDesktop]}>
            {props.isAssetExecution
              ? "Customer sale vs driver cost & posted expenses"
              : "Revised sale & cost after CN/DN lines"}
          </Text>
        </View>
        <View style={[styles.badge, isDesktop && styles.badgeDesktop]}>
          <Text style={[styles.badgeText, isDesktop && styles.badgeTextDesktop]}>
            {activeCount}
          </Text>
        </View>
      </View>

      <ProvisionRevisedPartiesCard
        clientName={props.clientName}
        clientAvatarUrl={props.clientAvatarUrl}
        clientAvatarSeed={props.clientAvatarSeed}
        clientOrganizationImageUrl={props.clientOrganizationImageUrl}
        clientOrganizationAvatarSeed={props.clientOrganizationAvatarSeed}
        clientIntegrated={props.clientIntegrated}
        sales={props.sales}
        adjSales={props.adjSales}
        revenueSideDelta={props.revenueSideDelta}
        supplierName={props.supplierName}
        supplierAvatarUrl={props.supplierAvatarUrl}
        supplierAvatarSeed={props.supplierAvatarSeed}
        supplierOrganizationImageUrl={props.supplierOrganizationImageUrl}
        supplierOrganizationAvatarSeed={props.supplierOrganizationAvatarSeed}
        supplierIntegrated={props.supplierIntegrated}
        cost={props.cost}
        adjCost={props.adjCost}
        costSideDelta={props.costSideDelta}
        costLaneLabel={props.costLaneLabel}
        costPartyEntityType={props.isAssetExecution ? "driver" : "supplier"}
        costBreakdownLines={props.costBreakdownLines}
        costUnset={props.costUnset}
        onSelectSide={props.onOpenProvision}
        layout={layout}
      />

      {props.onRequestDeduction && passThroughRecommendations.length > 0 ? (
        <ProvisionPassThroughCard
          recommendations={passThroughRecommendations}
          isAssetExecution={Boolean(props.isAssetExecution)}
          onRequestDeduction={props.onRequestDeduction}
        />
      ) : null}

      <View style={styles.tableToolbar}>
        <Text style={[styles.tableTitle, isDesktop && styles.tableTitleDesktop]}>
          Adjustment lines
        </Text>
        {props.canAddAdjustment !== false && (
        <View style={styles.toolbarActions}>
          <Pressable
            style={[styles.addBtnSale, isDesktop && styles.addBtnDesktop]}
            onPress={() => props.onOpenProvision("client")}
          >
            <Feather name="plus" size={isDesktop ? 13 : 12} color={Theme.primary} />
            <Text style={[styles.addBtnSaleText, isDesktop && styles.addBtnTextDesktop]}>
              Sale
            </Text>
          </Pressable>
          <Pressable
            style={[styles.addBtnCost, isDesktop && styles.addBtnDesktop]}
            onPress={() => props.onOpenProvision("supplier")}
          >
            <Feather name="plus" size={isDesktop ? 13 : 12} color="#0f766e" />
            <Text style={[styles.addBtnCostText, isDesktop && styles.addBtnTextDesktop]}>
              {props.isAssetExecution ? "Driver" : "Cost"}
            </Text>
          </Pressable>
        </View>
        )}
      </View>

      <View style={[styles.table, isDesktop && styles.tableDesktop]}>
        <View style={[styles.tableHead, isDesktop && styles.tableHeadDesktop]}>
          <View style={[styles.colPartyLane, isDesktop && styles.colPartyLaneDesktop]}>
            <Text style={[styles.th, isDesktop && styles.thDesktop]} numberOfLines={1}>
              Party
            </Text>
          </View>
          <View style={styles.colNote}>
            <Text style={[styles.th, isDesktop && styles.thDesktop]} numberOfLines={1}>
              Note
            </Text>
          </View>
          <View style={styles.colReason}>
            <Text style={[styles.th, isDesktop && styles.thDesktop]} numberOfLines={1}>
              Reason
            </Text>
          </View>
          <View style={[styles.colAmt, { width: colAmt }]}>
            <Text style={[styles.th, styles.thAmt, isDesktop && styles.thDesktop]} numberOfLines={1}>
              Amount
            </Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <Text style={[styles.empty, isDesktop && styles.emptyDesktop]}>
            No provisions yet — tap Sale or Cost to add a CN/DN.
          </Text>
        ) : (
          rows.map((adj) => {
            const voided = isAdjustmentVoided(adj);
            const isSale = adj.type === "revenue";
            const partyName = isSale ? props.clientName : props.supplierName;
            const costEntityType = props.isAssetExecution ? "driver" : "supplier";
            const isSelected = selectedRowId === adj.id;
            const canEdit = !voided && typeof props.onEditAdjustment === "function";
            return (
              <View key={adj.id} style={styles.trWrap}>
              <Pressable
                style={[
                  styles.tr,
                  isDesktop && styles.trDesktop,
                  voided && styles.trVoided,
                  isSelected && styles.trSelected,
                ]}
                onPress={() =>
                  setSelectedRowId((prev) => (prev === adj.id ? null : adj.id))
                }
              >
                <View style={[styles.colPartyLane, isDesktop && styles.colPartyLaneDesktop]}>
                  <EntityAvatar
                    name={partyName}
                    avatarUrl={isSale ? props.clientAvatarUrl : props.supplierAvatarUrl}
                    avatarSeed={isSale ? props.clientAvatarSeed : props.supplierAvatarSeed}
                    entityType={isSale ? "client" : costEntityType}
                    size={isDesktop ? 24 : 20}
                    showIntegrationBadge={false}
                  />
                  <View style={styles.partyLaneBody}>
                    <Text
                      style={[
                        styles.partyCell,
                        isDesktop && styles.partyCellDesktop,
                        voided && styles.struck,
                      ]}
                      numberOfLines={2}
                    >
                      {partyName}
                    </Text>
                    <View
                      style={[
                        styles.laneChip,
                        isSale ? styles.laneChipSale : styles.laneChipCost,
                        voided && styles.laneChipVoided,
                      ]}
                    >
                      <Text
                        style={[
                          styles.laneChipText,
                          isSale ? styles.laneChipTextSale : styles.laneChipTextCost,
                          voided && styles.struck,
                        ]}
                        numberOfLines={1}
                      >
                        {laneLabel(adj.type)}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.colNote}>
                  <Pressable
                    style={[
                      styles.notePill,
                      adj.impact === "minus" ? styles.notePillCn : styles.notePillDn,
                      voided && styles.notePillVoided,
                    ]}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      props.onViewNotePdf?.(adj);
                    }}
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
                  <Text
                    style={[
                      styles.td,
                      styles.tdReason,
                      isDesktop && styles.tdDesktop,
                      voided && styles.struck,
                    ]}
                    numberOfLines={3}
                  >
                    {(adj.reason ?? "").trim() || "—"}
                  </Text>
                </View>
                <View style={[styles.colAmt, { width: colAmt }]}>
                  <Text
                    style={[
                      styles.td,
                      styles.tdAmt,
                      isDesktop && styles.tdAmtDesktop,
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

              {isSelected ? (
                <View style={styles.rowActions}>
                  {props.onViewNotePdf ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.rowActionBtn,
                        pressed && styles.rowActionBtnPressed,
                      ]}
                      onPress={() => props.onViewNotePdf?.(adj)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${cnDnLabel(adj.impact)} PDF`}
                    >
                      <Feather
                        name="file-text"
                        size={11}
                        color={adj.impact === "minus" ? Theme.primary : "#0f766e"}
                      />
                      <Text style={styles.rowActionBtnText}>View PDF</Text>
                    </Pressable>
                  ) : null}
                  {canEdit ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.rowActionBtn,
                        styles.rowActionBtnPrimary,
                        pressed && styles.rowActionBtnPressed,
                      ]}
                      onPress={() => props.onEditAdjustment?.(adj)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${cnDnLabel(adj.impact)}`}
                    >
                      <Feather name="edit-2" size={11} color={Theme.buttonPrimaryText} />
                      <Text style={styles.rowActionBtnTextPrimary}>
                        Edit {cnDnLabel(adj.impact)}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              </View>
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
    marginTop: 8,
    backgroundColor: "#fff",
    padding: 10,
    gap: 8,
  },
  cardDesktop: {
    marginTop: 10,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
    lineHeight: 12,
  },
  titleDesktop: {
    fontSize: 11,
    letterSpacing: 0.8,
    lineHeight: 14,
  },
  hint: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 12,
    color: Theme.textMuted,
  },
  hintDesktop: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  badge: {
    minWidth: 22,
    height: 22,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  badgeDesktop: {
    minWidth: 26,
    height: 26,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    fontVariant: ["tabular-nums"],
  },
  badgeTextDesktop: {
    fontSize: 11,
  },
  tableToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 2,
  },
  tableTitle: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
  },
  tableTitleDesktop: {
    fontSize: 10,
    lineHeight: 12,
  },
  toolbarActions: { flexDirection: "row", gap: 6 },
  addBtnDesktop: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addBtnTextDesktop: {
    fontSize: 10,
  },
  addBtnSale: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(99,102,241,0.06)",
  },
  addBtnSaleText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  addBtnCost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(15,118,110,0.06)",
  },
  addBtnCostText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#0f766e",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  table: {
    overflow: "hidden",
    backgroundColor: "#fafbfc",
  },
  tableDesktop: {
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e8ecf4",
  },
  tableHeadDesktop: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  th: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    lineHeight: 11,
  },
  thDesktop: {
    fontSize: 10,
    lineHeight: 13,
  },
  thAmt: {
    textAlign: "right",
    width: "100%",
  },
  colPartyLane: {
    flex: 1,
    minWidth: 96,
    maxWidth: 128,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingRight: 4,
  },
  colPartyLaneDesktop: {
    minWidth: 140,
    maxWidth: 220,
    gap: 8,
    paddingRight: 8,
  },
  partyLaneBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  colNote: {
    width: COL_NOTE,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
  },
  colReason: {
    flex: 1.35,
    minWidth: 72,
    justifyContent: "center",
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  colAmt: {
    width: COL_AMT,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  empty: {
    padding: 12,
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 14,
  },
  emptyDesktop: {
    padding: 16,
    fontSize: 12,
    lineHeight: 17,
  },
  tr: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 38,
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
  },
  trDesktop: {
    minHeight: 44,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  trWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8ecf4",
    backgroundColor: "#fff",
  },
  trSelected: {
    backgroundColor: "#fafbff",
    borderBottomColor: Theme.pulseIndigoRing,
  },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 2,
    backgroundColor: "#fafbff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.pulseIndigoRing,
  },
  rowActionBtn: {
    flex: 1,
    minWidth: 96,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: Theme.cardWhite,
    minHeight: 32,
  },
  rowActionBtnPrimary: {
    backgroundColor: Theme.buttonPrimary,
  },
  rowActionBtnPressed: {
    opacity: 0.88,
  },
  rowActionBtnText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  rowActionBtnTextPrimary: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.2,
  },
  trVoided: { opacity: 0.55 },
  td: {
    fontSize: 9,
    fontWeight: "400",
    color: "#475569",
    lineHeight: 13,
  },
  tdDesktop: {
    fontSize: 11,
    lineHeight: 15,
  },
  partyCell: {
    ...FinanceTxnTypography.partyTitle,
    fontStyle: "normal",
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 12,
    color: Theme.textPrimaryDark,
    minWidth: 0,
  },
  partyCellDesktop: {
    fontSize: 11,
    lineHeight: 14,
  },
  laneChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  laneChipSale: {
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  laneChipCost: {
    backgroundColor: "rgba(15,118,110,0.08)",
    borderColor: "rgba(15,118,110,0.22)",
  },
  laneChipVoided: {
    opacity: 0.75,
  },
  laneChipText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  laneChipTextSale: {
    color: Theme.primary,
  },
  laneChipTextCost: {
    color: "#0f766e",
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
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  noteCn: { color: "#4D3636" },
  noteDn: { color: "#e11d48" },
  tdReason: {
    fontWeight: "500",
    color: "#64748b",
    fontSize: 9,
    lineHeight: 13,
  },
  tdAmt: {
    fontSize: 9,
    textAlign: "right",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    lineHeight: 13,
  },
  tdAmtDesktop: {
    fontSize: 11,
    lineHeight: 15,
  },
  amtSale: { color: "#059669" },
  amtCost: { color: "#dc2626" },
  struck: {
    textDecorationLine: "line-through",
    opacity: 0.75,
  },
});
