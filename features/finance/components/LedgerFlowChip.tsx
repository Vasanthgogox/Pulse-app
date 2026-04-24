import Theme from "@/constants/Theme";
import type { LedgerFlowType } from "@/features/finance/ledger/ledgerEntryModel";
import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function getLedgerFlowForRow(row: LedgerRow): LedgerFlowType | null {
  const fromCol = (row.ledger_flow_type ?? "").trim().toLowerCase();
  if (fromCol === "receivable" || fromCol === "payable" || fromCol === "expense") {
    return fromCol as LedgerFlowType;
  }
  return interpretLedgerRowStructured({
    contact_id: row.contact_id ?? null,
    contact_type: row.contact_type ?? null,
    trip_id: row.trip_id ?? null,
    description: row.description ?? null,
    amount_in: row.amount_in,
    amount_out: row.amount_out,
    vehicle_number: row.vehicle_number ?? null,
  }).transaction_type;
}

const FLOW_LABEL: Record<LedgerFlowType, string> = {
  receivable: "Receivable",
  payable: "Payable",
  expense: "Expense",
};

export function LedgerFlowChip({
  row,
  compact = false,
}: {
  row: LedgerRow;
  compact?: boolean;
}) {
  const flow = getLedgerFlowForRow(row);
  if (!flow) return null;
  const label = FLOW_LABEL[flow];
  const palette =
    flow === "receivable"
      ? { bg: Theme.positiveMuted, fg: Theme.positive }
      : flow === "payable"
        ? { bg: Theme.negativeMuted, fg: Theme.teslaRed }
        : { bg: Theme.warningMuted, fg: Theme.warning };

  return (
    <View
      style={[
        styles.chip,
        compact && styles.chipCompact,
        { backgroundColor: palette.bg },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          compact && styles.chipTextCompact,
          { color: palette.fg },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  chipCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 2,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase" as const,
  },
  chipTextCompact: {
    fontSize: 9,
  },
});
