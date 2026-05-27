import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { EntityAvatar } from "@/components/EntityAvatar";
import { LedgerTicketChrome } from "@/components/ledger/LedgerTicketChrome";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";

export interface LedgerReviewTicketProps {
  type: "in" | "out";
  amountStr: string;
  partyDisplayName?: string | null;
  partyAvatarUrl?: string | null;
  partyAvatarSeed?: string | null;
  partyEntityType?: PartyEntityType;
  partyIsIntegrated?: boolean;
  reconRows: { label: string; value: string }[];
  isEditMode?: boolean;
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function TicketStat({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <View style={[styles.statCell, align === "right" && styles.statCellRight]}>
      <Text style={[styles.fieldLabel, align === "right" && styles.alignRight]}>
        {label}
      </Text>
      <Text
        style={[styles.fieldValue, align === "right" && styles.alignRight]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export const LedgerReviewTicket = memo(function LedgerReviewTicket(props: LedgerReviewTicketProps) {
  const accent = props.type === "in" ? Theme.darkGreen : Theme.teslaRed;
  const amount = parseAmount(props.amountStr);
  const direction = props.type === "in" ? "Cash in" : "Cash out";
  const headerColor = props.type === "in" ? Theme.darkGreen : Theme.teslaRed;

  const partyRow = props.reconRows.find((r) => r.label.toLowerCase().includes("party"));
  const tripRow = props.reconRows.find((r) => r.label.toLowerCase().includes("voyage"));
  const modeRow = props.reconRows.find((r) => r.label.toLowerCase().includes("payment mode"));
  const refRow = props.reconRows.find((r) => r.label.toLowerCase().includes("reference"));
  const dateRow = props.reconRows.find((r) => r.label.toLowerCase().includes("sync date"));
  const typeRow = props.reconRows.find((r) => r.label.toLowerCase().includes("sync type"));

  const otherRows = props.reconRows.filter(
    (r) => r !== partyRow && r !== tripRow && r !== modeRow && r !== refRow && r !== dateRow && r !== typeRow,
  );

  return (
    <LedgerTicketChrome
      headerKicker="PULSE LEDGER"
      headerCaption={props.isEditMode ? "Update entry" : "Record payment"}
      headerCode={direction.toUpperCase()}
      headerColor={headerColor}
    >
      <View style={styles.amountRow}>
        <View>
          <Text style={styles.amountEyebrow}>Settlement</Text>
          <Text style={[styles.amountValue, { color: accent }]}>
            ₹
            {amount.toLocaleString("en-IN", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
        <View style={[styles.directionPill, { borderColor: accent, backgroundColor: `${accent}14` }]}>
          <Text style={[styles.directionPillText, { color: accent }]}>{direction}</Text>
        </View>
      </View>

      {(props.partyDisplayName ?? "").trim() ? (
        <View style={styles.partyRow}>
          <EntityAvatar
            name={props.partyDisplayName ?? ""}
            avatarUrl={props.partyAvatarUrl}
            avatarSeed={props.partyAvatarSeed}
            entityType={props.partyEntityType ?? "client"}
            isIntegrated={props.partyIsIntegrated}
            size={42}
            showIntegrationBadge={false}
          />
          <View style={styles.partyText}>
            <Text style={styles.fieldLabel}>Party</Text>
            <Text style={styles.partyName} numberOfLines={2}>
              {props.partyDisplayName}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.statRow}>
        {modeRow ? <TicketStat label="Paid via" value={modeRow.value} /> : null}
        {dateRow ? (
          <TicketStat label="Date" value={dateRow.value} align="right" />
        ) : tripRow ? (
          <TicketStat label="Trip" value={tripRow.value} align="right" />
        ) : null}
      </View>

      {tripRow && dateRow ? (
        <View style={styles.statRow}>
          <TicketStat label="Voyage" value={tripRow.value} />
          {typeRow ? <TicketStat label="Type" value={typeRow.value} align="right" /> : null}
        </View>
      ) : null}

      {refRow && refRow.value !== "—" && refRow.value !== "— (cash)" ? (
        <View style={styles.refBlock}>
          <Text style={styles.fieldLabel}>Reference / UTR</Text>
          <Text style={styles.refValue}>{refRow.value}</Text>
        </View>
      ) : null}

      {otherRows.map((row) => (
        <View key={row.label} style={styles.otherRow}>
          <Text style={styles.fieldLabel}>{row.label}</Text>
          <Text style={styles.fieldValue} numberOfLines={2}>
            {row.value}
          </Text>
        </View>
      ))}

      <Text style={styles.stubHint}>
        Tear along the line — tap Save below to post this entry to your books.
      </Text>
    </LedgerTicketChrome>
  );
});

const styles = StyleSheet.create({
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  amountEyebrow: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.textMuted,
  },
  amountValue: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  directionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  directionPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  partyText: { flex: 1, minWidth: 0 },
  partyName: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  statCell: { flex: 1, minWidth: 0, gap: 2 },
  statCellRight: { alignItems: "flex-end" },
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.textMuted,
  },
  fieldValue: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 12,
    lineHeight: 16,
  },
  alignRight: { textAlign: "right" },
  refBlock: { gap: 4 },
  refValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.4,
  },
  otherRow: { gap: 2 },
  stubHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "italic",
    lineHeight: 14,
    marginTop: 2,
  },
});
