import { memo, useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import Theme from "@/constants/Theme";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripEntryFinancialSnapshot } from "@/features/finance/utils/computeTripEntryFinancials.util";
import {
  isAdjustmentVoided,
  type TripAdjustment,
} from "@/features/trips/services/tripAdjustments";
import { formatINR } from "@/lib/format";
import {
  buildLedgerFocusedTransactionLines,
  type LedgerFocusedTransactionLane,
} from "@/lib/ledgerFocusedTripTransactions.util";

const VALUE_COL_WIDTH = 78;
const VALUE_COL_WIDTH_COMPACT = 70;

function laneDelta(adjustments: TripAdjustment[], lane: TripAdjustment["type"]): number {
  return adjustments
    .filter((a) => a.type === lane && !isAdjustmentVoided(a))
    .reduce((sum, a) => sum + (a.impact === "plus" ? a.amount : -a.amount), 0);
}

function baseFromRevised(revised: number, delta: number): number {
  return Math.max(0, Math.round(revised - delta));
}

function cnDnShort(impact: TripAdjustment["impact"]): string {
  return impact === "minus" ? "CN" : "DN";
}

function signedAmount(adj: TripAdjustment): string {
  const sign = adj.impact === "plus" ? "+" : "−";
  return `${sign}${formatINR(adj.amount)}`;
}

type LedgerFocusedLane = {
  id: string;
  eyebrow: string;
  targetLabel: string;
  targetInr: number;
  recordedLabel: string;
  recordedInr: number;
  dueInr: number;
  isInflow: boolean;
};

function buildLedgerFocusedLanes(
  snap: TripEntryFinancialSnapshot | null | undefined,
  flowType: "in" | "out",
  options: {
    showClient: boolean;
    showSupplier: boolean;
    showDriver: boolean;
  },
): LedgerFocusedLane[] {
  if (!snap) return [];
  const { lines, financials } = snap;
  const lanes: LedgerFocusedLane[] = [];

  if (flowType === "in" && options.showClient) {
    if (lines.client_sale > 0 || lines.client_received > 0 || lines.client_due > 0) {
      lanes.push({
        id: "client",
        eyebrow: "Ledger · Receivable",
        targetLabel: "Revised sale",
        targetInr: lines.client_sale,
        recordedLabel: "Received already",
        recordedInr: lines.client_received,
        dueInr: lines.client_due,
        isInflow: true,
      });
    }
  }

  if (flowType === "out" && options.showSupplier) {
    const due = financials.supplier_payable_raw ?? lines.supplier_due;
    if (lines.supplier_cost > 0 || lines.supplier_paid > 0 || due > 0) {
      lanes.push({
        id: "supplier",
        eyebrow: "Ledger · Supplier",
        targetLabel: "Revised cost",
        targetInr: lines.supplier_cost,
        recordedLabel: "Paid already",
        recordedInr: lines.supplier_paid,
        dueInr: due,
        isInflow: false,
      });
    }
  }

  if (flowType === "out" && options.showDriver) {
    const due = financials.driver_payable_raw ?? lines.driver_due;
    if (lines.driver_to_pay > 0 || lines.driver_paid > 0 || due > 0) {
      lanes.push({
        id: "driver",
        eyebrow: "Ledger · Driver",
        targetLabel: "Payable",
        targetInr: lines.driver_to_pay,
        recordedLabel: "Paid already",
        recordedInr: lines.driver_paid,
        dueInr: due,
        isInflow: false,
      });
    }
  }

  return lanes;
}

function laneIdToTransactionLane(id: string): LedgerFocusedTransactionLane | null {
  if (id === "client" || id === "supplier" || id === "driver") return id;
  return null;
}

function valueColStyle(compact?: boolean): ViewStyle {
  return compact ? styles.valueColCompact : styles.valueCol;
}

function AlignedAmountRow({
  label,
  value,
  labelStyle,
  valueStyle,
  compact,
  nested,
  labelLines = 1,
}: {
  label: string;
  value: string;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
  compact?: boolean;
  nested?: boolean;
  labelLines?: number;
}) {
  return (
    <View style={[styles.alignedRow, compact && styles.alignedRowCompact]}>
      <View
        style={[
          styles.labelCol,
          nested && styles.labelColNested,
          nested && compact && styles.labelColNestedCompact,
        ]}
      >
        <Text
          style={[styles.labelText, compact && styles.labelTextCompact, labelStyle]}
          numberOfLines={labelLines}
        >
          {label}
        </Text>
      </View>
      <View style={valueColStyle(compact)}>
        <Text
          style={[styles.valueText, compact && styles.valueTextCompact, valueStyle]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function TransactionSplitLines({
  lines,
  compact,
  isInflow,
}: {
  lines: ReturnType<typeof buildLedgerFocusedTransactionLines>;
  compact?: boolean;
  isInflow: boolean;
}) {
  if (lines.length === 0) return null;
  const amountStyle = isInflow ? styles.splitValueIn : styles.splitValueOut;
  return (
    <View style={[styles.txSplitBlock, compact && styles.txSplitBlockCompact]}>
      {lines.map((line) => (
        <View key={line.id} style={styles.txSplitRow}>
          <View
            style={[
              styles.labelCol,
              styles.labelColNested,
              compact && styles.labelColNestedCompact,
            ]}
          >
            <Text
              style={[styles.splitLabel, compact && styles.splitLabelCompact]}
              numberOfLines={1}
            >
              {line.label}
            </Text>
            <Text
              style={[styles.splitDate, compact && styles.splitDateCompact]}
              numberOfLines={1}
            >
              {line.dateLabel}
            </Text>
          </View>
          <View style={valueColStyle(compact)}>
            <Text
              style={[
                styles.splitValue,
                compact && styles.splitValueCompact,
                amountStyle,
              ]}
              numberOfLines={1}
            >
              {formatINR(line.amountInr)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SettlementRow({
  label,
  value,
  tone,
  compact,
}: {
  label: string;
  value: string;
  tone: "default" | "recorded" | "dueIn" | "dueOut" | "settled";
  compact?: boolean;
}) {
  const valueStyle =
    tone === "recorded"
      ? styles.settlementRecorded
      : tone === "dueIn"
        ? [styles.settlementDueIn, compact && styles.settlementDueInCompact]
        : tone === "dueOut"
          ? [styles.settlementDueOut, compact && styles.settlementDueOutCompact]
          : tone === "settled"
            ? styles.settlementSettled
            : undefined;

  const labelStyle =
    tone === "recorded"
      ? styles.settlementLabelRecorded
      : tone === "dueIn" || tone === "dueOut"
        ? styles.settlementLabelDue
        : undefined;

  return (
    <AlignedAmountRow
      label={label}
      value={value}
      compact={compact}
      labelStyle={labelStyle}
      valueStyle={valueStyle}
    />
  );
}

export type LedgerFocusedTripSettlementSummaryProps = {
  flowType: "in" | "out";
  adjustments: TripAdjustment[];
  revisedAmount: number;
  financialSnapshot?: TripEntryFinancialSnapshot | null;
  ledgerTransactions?: LedgerRow[] | null;
  tripId?: string | null;
  tripDisplayNumber?: string | null;
  showClientLane?: boolean;
  showSupplierLane?: boolean;
  showDriverLane?: boolean;
  showNoDueTag?: boolean;
  noDueTagLabel?: string;
  compact?: boolean;
};

export const LedgerFocusedTripSettlementSummary = memo(function LedgerFocusedTripSettlementSummary({
  flowType,
  adjustments,
  revisedAmount,
  financialSnapshot,
  ledgerTransactions,
  tripId,
  tripDisplayNumber,
  showClientLane = true,
  showSupplierLane = true,
  showDriverLane = true,
  showNoDueTag = false,
  noDueTagLabel,
  compact = false,
}: LedgerFocusedTripSettlementSummaryProps) {
  const { lane, laneLabel, provisionRows } = useMemo(() => {
    const laneType: TripAdjustment["type"] = flowType === "in" ? "revenue" : "cost";
    const active = adjustments
      .filter((a) => a.type === laneType && !isAdjustmentVoided(a))
      .sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      );
    return {
      lane: laneType,
      laneLabel: laneType === "revenue" ? "Sale" : "Cost",
      provisionRows: active,
    };
  }, [adjustments, flowType]);

  const ledgerLanes = useMemo(
    () =>
      buildLedgerFocusedLanes(financialSnapshot, flowType, {
        showClient: showClientLane,
        showSupplier: showSupplierLane,
        showDriver: showDriverLane,
      }),
    [financialSnapshot, flowType, showClientLane, showSupplierLane, showDriverLane],
  );

  const transactionLinesByLane = useMemo(() => {
    if (!tripId) {
      return {} as Partial<
        Record<LedgerFocusedTransactionLane, ReturnType<typeof buildLedgerFocusedTransactionLines>>
      >;
    }
    const out: Partial<
      Record<LedgerFocusedTransactionLane, ReturnType<typeof buildLedgerFocusedTransactionLines>>
    > = {};
    for (const laneSummary of ledgerLanes) {
      const laneKey = laneIdToTransactionLane(laneSummary.id);
      if (!laneKey) continue;
      const lines = buildLedgerFocusedTransactionLines(
        ledgerTransactions,
        tripId,
        tripDisplayNumber,
        laneKey,
      );
      if (lines.length > 0) out[laneKey] = lines;
    }
    return out;
  }, [ledgerLanes, ledgerTransactions, tripDisplayNumber, tripId]);

  const hasProvision = provisionRows.length > 0;
  const delta = laneDelta(adjustments, lane);
  const baseAmount = baseFromRevised(revisedAmount, delta);
  const showRevised = hasProvision && baseAmount !== revisedAmount;
  const revisedDeltaInr = showRevised ? revisedAmount - baseAmount : 0;
  const showLineAmountColumn = !showRevised || provisionRows.length > 1;
  const hasLedger = ledgerLanes.length > 0 || showNoDueTag;

  if (!hasProvision && !hasLedger) return null;

  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      {hasProvision ? (
        <View style={[styles.block, compact && styles.blockCompact, styles.blockFirst]}>
          <View style={[styles.provisionHeadRow, compact && styles.provisionHeadRowCompact]}>
            <View style={[styles.labelCol, styles.provisionHeadLabelCol]}>
              <Text
                style={[styles.eyebrow, compact && styles.eyebrowCompact]}
                numberOfLines={1}
              >
                Adjustment · {laneLabel}
              </Text>
            </View>
            {showRevised ? (
              <View style={[styles.provisionHeadValueCol, compact && styles.provisionHeadValueColCompact]}>
                <View style={[styles.revisedRow, compact && styles.revisedRowCompact]}>
                  <Text style={[styles.revisedBase, compact && styles.revisedBaseCompact]}>
                    {formatINR(baseAmount)}
                  </Text>
                  <Text style={[styles.revisedArrow, compact && styles.revisedArrowCompact]}>→</Text>
                  <Text style={[styles.revisedValue, compact && styles.revisedValueCompact]}>
                    {formatINR(revisedAmount)}
                  </Text>
                </View>
                {revisedDeltaInr !== 0 ? (
                  <Text
                    style={[
                      styles.revisedDelta,
                      compact && styles.revisedDeltaCompact,
                      revisedDeltaInr < 0 ? styles.revisedDeltaCn : styles.revisedDeltaDn,
                    ]}
                    numberOfLines={1}
                  >
                    {revisedDeltaInr < 0 ? "−" : "+"}
                    {formatINR(Math.abs(revisedDeltaInr))}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={valueColStyle(compact)} />
            )}
          </View>
          <View style={[styles.lines, compact && styles.linesCompact]}>
            {provisionRows.map((adj) => (
              <View key={adj.id} style={[styles.lineRow, compact && styles.lineRowCompact]}>
                <View
                  style={[
                    styles.cnDnPill,
                    compact && styles.cnDnPillCompact,
                    adj.impact === "minus" ? styles.cnDnPillCn : styles.cnDnPillDn,
                  ]}
                >
                  <Text
                    style={[
                      styles.cnDnPillText,
                      compact && styles.cnDnPillTextCompact,
                      adj.impact === "minus" ? styles.cnDnPillTextCn : styles.cnDnPillTextDn,
                    ]}
                  >
                    {cnDnShort(adj.impact)}
                  </Text>
                </View>
                <View style={styles.labelCol}>
                  <Text
                    style={[styles.reason, compact && styles.reasonCompact]}
                    numberOfLines={compact ? 2 : 1}
                  >
                    {adj.reason?.trim() || "Adjustment"}
                  </Text>
                </View>
                {showLineAmountColumn ? (
                  <View style={valueColStyle(compact)}>
                    <Text
                      style={[
                        styles.amount,
                        compact && styles.amountCompact,
                        adj.impact === "minus" ? styles.amountCn : styles.amountDn,
                      ]}
                      numberOfLines={1}
                    >
                      {signedAmount(adj)}
                    </Text>
                  </View>
                ) : showRevised ? (
                  <View style={valueColStyle(compact)} />
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {ledgerLanes.map((laneSummary, laneIdx) => {
        const laneKey = laneIdToTransactionLane(laneSummary.id);
        const splitLines = laneKey ? (transactionLinesByLane[laneKey] ?? []) : [];
        return (
          <View
            key={laneSummary.id}
            style={[
              styles.block,
              compact && styles.blockCompact,
              styles.ledgerBlock,
              laneIdx === 0 && !hasProvision && styles.blockFirst,
            ]}
          >
            <Text style={[styles.eyebrow, compact && styles.eyebrowCompact]}>
              {laneSummary.eyebrow}
            </Text>
            <View style={[styles.ledgerPanel, compact && styles.ledgerPanelCompact]}>
              {laneSummary.targetInr > 0 ? (
                <SettlementRow
                  label={laneSummary.targetLabel}
                  value={formatINR(laneSummary.targetInr)}
                  tone="default"
                  compact={compact}
                />
              ) : null}
              {laneSummary.recordedInr > 0 ? (
                <View style={styles.recordedGroup}>
                  <SettlementRow
                    label={laneSummary.recordedLabel}
                    value={formatINR(laneSummary.recordedInr)}
                    tone="recorded"
                    compact={compact}
                  />
                  <TransactionSplitLines
                    lines={splitLines}
                    compact={compact}
                    isInflow={laneSummary.isInflow}
                  />
                </View>
              ) : null}
              {laneSummary.dueInr > 0 ? (
                <SettlementRow
                  label="Due"
                  value={formatINR(laneSummary.dueInr)}
                  tone={laneSummary.isInflow ? "dueIn" : "dueOut"}
                  compact={compact}
                />
              ) : laneSummary.recordedInr > 0 && laneSummary.dueInr <= 0 ? (
                <SettlementRow
                  label="Due"
                  value="Nothing due"
                  tone="settled"
                  compact={compact}
                />
              ) : null}
            </View>
          </View>
        );
      })}

      {showNoDueTag && ledgerLanes.length === 0 && noDueTagLabel ? (
        <View
          style={[
            styles.block,
            compact && styles.blockCompact,
            styles.ledgerBlock,
            !hasProvision && styles.blockFirst,
          ]}
        >
          <Text style={[styles.eyebrow, compact && styles.eyebrowCompact]}>
            {flowType === "in" ? "Ledger · Receivable" : "Ledger · Payable"}
          </Text>
          <View style={[styles.ledgerPanel, compact && styles.ledgerPanelCompact]}>
            <SettlementRow label="Due" value={noDueTagLabel} tone="settled" compact={compact} />
          </View>
        </View>
      ) : null}
    </View>
  );
});

/** @deprecated Use LedgerFocusedTripSettlementSummary */
export const LedgerFocusedTripProvisionLines = LedgerFocusedTripSettlementSummary;

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
    gap: 0,
  },
  rootCompact: {
    marginTop: 0,
  },
  block: {
    gap: 8,
    paddingTop: 12,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderInput,
    width: "100%",
    minWidth: 0,
  },
  blockCompact: {
    paddingTop: 10,
    marginTop: 8,
    gap: 6,
  },
  blockFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
    marginTop: 0,
  },
  ledgerBlock: {
    gap: 6,
  },
  ledgerPanel: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    width: "100%",
    minWidth: 0,
  },
  ledgerPanelCompact: {
    padding: 8,
    gap: 5,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  eyebrowCompact: {
    fontSize: 9,
    letterSpacing: 0.2,
    lineHeight: 12,
  },
  provisionHeadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
    minWidth: 0,
    gap: 8,
  },
  provisionHeadRowCompact: {
    gap: 6,
  },
  provisionHeadLabelCol: {
    paddingTop: 2,
    justifyContent: "flex-start",
  },
  provisionHeadValueCol: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    minWidth: VALUE_COL_WIDTH,
    maxWidth: "58%",
    gap: 2,
  },
  provisionHeadValueColCompact: {
    minWidth: VALUE_COL_WIDTH_COMPACT,
    maxWidth: "56%",
  },
  alignedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    minWidth: 0,
    gap: 8,
  },
  alignedRowCompact: {
    gap: 6,
  },
  labelCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  labelColNested: {
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderInput,
  },
  labelColNestedCompact: {
    paddingLeft: 8,
  },
  labelText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textRouteCard,
    lineHeight: 14,
  },
  labelTextCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  valueCol: {
    width: VALUE_COL_WIDTH,
    minWidth: VALUE_COL_WIDTH,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  valueColCompact: {
    width: VALUE_COL_WIDTH_COMPACT,
    minWidth: VALUE_COL_WIDTH_COMPACT,
  },
  valueText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    width: "100%",
  },
  valueTextCompact: {
    fontSize: 11,
    fontWeight: "700",
  },
  revisedRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
    flexWrap: "nowrap",
    gap: 5,
    flexShrink: 0,
    minWidth: 0,
    maxWidth: "100%",
  },
  revisedRowCompact: {
    gap: 3,
  },
  revisedBase: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
    lineHeight: 14,
  },
  revisedBaseCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  revisedArrow: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  revisedArrowCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  revisedValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    lineHeight: 16,
  },
  revisedValueCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  revisedDelta: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    lineHeight: 14,
    alignSelf: "flex-end",
  },
  revisedDeltaCompact: {
    fontSize: 10,
  },
  revisedDeltaCn: {
    color: Theme.success,
  },
  revisedDeltaDn: {
    color: Theme.negative,
  },
  lines: {
    gap: 6,
    width: "100%",
    minWidth: 0,
  },
  linesCompact: {
    gap: 5,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  lineRowCompact: {
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 7,
    alignItems: "center",
  },
  cnDnPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  cnDnPillCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cnDnPillCn: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  cnDnPillDn: {
    backgroundColor: Theme.warningMuted,
    borderColor: "rgba(180, 83, 9, 0.28)",
  },
  cnDnPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  cnDnPillTextCompact: {
    fontSize: 8,
  },
  cnDnPillTextCn: {
    color: Theme.success,
  },
  cnDnPillTextDn: {
    color: Theme.warning,
  },
  reason: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
  },
  reasonCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  amount: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    width: "100%",
  },
  amountCompact: {
    fontSize: 10,
  },
  amountCn: {
    color: Theme.success,
  },
  amountDn: {
    color: Theme.negative,
  },
  settlementLabelRecorded: {
    color: Theme.textRouteCard,
  },
  settlementLabelDue: {
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  settlementRecorded: {
    color: Theme.textPrimaryDark,
    fontWeight: "700",
  },
  settlementDueIn: {
    color: Theme.success,
    fontSize: 13,
    fontWeight: "700",
  },
  settlementDueInCompact: {
    fontSize: 12,
    fontWeight: "700",
  },
  settlementDueOut: {
    color: Theme.negative,
    fontSize: 13,
    fontWeight: "700",
  },
  settlementDueOutCompact: {
    fontSize: 12,
    fontWeight: "700",
  },
  settlementSettled: {
    color: Theme.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  recordedGroup: {
    gap: 4,
    width: "100%",
    minWidth: 0,
  },
  txSplitBlock: {
    gap: 4,
    width: "100%",
    minWidth: 0,
    marginTop: 2,
  },
  txSplitBlockCompact: {
    gap: 3,
    marginTop: 0,
  },
  txSplitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
    minWidth: 0,
    gap: 8,
  },
  splitLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textRouteCard,
    lineHeight: 13,
  },
  splitLabelCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  splitDate: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 12,
    marginTop: 1,
  },
  splitDateCompact: {
    fontSize: 8,
    lineHeight: 11,
  },
  splitValue: {
    fontSize: 10,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    width: "100%",
  },
  splitValueCompact: {
    fontSize: 9,
  },
  splitValueIn: {
    color: Theme.textSecondary,
  },
  splitValueOut: {
    color: Theme.textSecondary,
  },
});
