import { AlertTriangle, CircleEllipsis, Info } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { LedgerTripSettlementPreview } from "@/lib/ledgerTripSettlementPreview.util";
import {
  formatLedgerTripSettlementPreviewLine,
  ledgerEntryLooksLikeDuplicate,
} from "@/lib/ledgerTripSettlementPreview.util";

export type LedgerTripSettlementNoteProps = {
  preview: LedgerTripSettlementPreview;
  enteredInr: number;
  compact?: boolean;
};

export function LedgerTripSettlementNote({
  preview,
  enteredInr,
  compact = false,
}: LedgerTripSettlementNoteProps) {
  const summary = formatLedgerTripSettlementPreviewLine(preview);
  const duplicateRisk = ledgerEntryLooksLikeDuplicate(preview, enteredInr);
  const exceedsDue =
    preview.dueInr > 0 && enteredInr > preview.dueInr + 0.01;

  if (preview.isFullySettled) {
    return (
      <View
        style={[
          styles.card,
          styles.cardWarning,
          compact && styles.cardCompact,
        ]}
      >
        <View style={styles.titleRow}>
          <AlertTriangle size={14} color={Theme.warning} strokeWidth={2.2} />
          <Text style={[styles.title, styles.titleWarning]}>
            Already recorded in ledger
          </Text>
        </View>
        <Text style={styles.body}>
          {preview.recordedVerb}{" "}
          <Text style={styles.bodyStrong}>{formatINR(preview.recordedInr)}</Text>
          {preview.targetInr > 0 ? (
            <>
              {" "}
              of {formatINR(preview.targetInr)} {preview.flowNoun} on this trip.
            </>
          ) : (
            " on this trip."
          )}
        </Text>
        <Text style={styles.sub}>
          Nothing is due. Saving the same payment again may create a duplicate
          ledger entry — only continue if you mean to record a correction or
          additional receipt.
        </Text>
        {duplicateRisk && enteredInr > 0 ? (
          <Text style={styles.duplicateHint}>
            Your amount matches what is already posted.
          </Text>
        ) : null}
      </View>
    );
  }

  if (preview.isPartiallySettled || preview.recordedInr > 0) {
    return (
      <View style={[styles.card, styles.cardInfo, compact && styles.cardCompact]}>
        <View style={styles.titleRow}>
          <Info size={14} color={Theme.primary} strokeWidth={2.2} />
          <Text style={styles.title}>Ledger on this trip</Text>
        </View>
        <Text style={styles.body}>{summary}</Text>
        {exceedsDue ? (
          <Text style={styles.duplicateHint}>
            Amount exceeds remaining due by{" "}
            {formatINR(enteredInr - preview.dueInr)}.
          </Text>
        ) : null}
      </View>
    );
  }

  if (preview.dueInr > 0) {
    return (
      <View style={[styles.card, styles.cardDue, compact && styles.cardCompact]}>
        <View style={styles.titleRow}>
          <CircleEllipsis size={14} color={Theme.textMuted} strokeWidth={2.2} />
          <Text style={styles.title}>Outstanding on this trip</Text>
        </View>
        <Text style={styles.body}>
          {preview.dueVerb}{" "}
          <Text style={styles.bodyStrong}>{formatINR(preview.dueInr)}</Text>
          {preview.targetInr > preview.dueInr ? (
            <>
              {" "}
              (of {formatINR(preview.targetInr)} {preview.flowNoun})
            </>
          ) : null}
        </Text>
        {exceedsDue ? (
          <Text style={styles.duplicateHint}>
            Entered amount is higher than the due balance.
          </Text>
        ) : null}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    marginTop: 4,
  },
  cardCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardWarning: {
    borderColor: "rgba(245, 158, 11, 0.35)",
    backgroundColor: "rgba(255, 251, 235, 0.95)",
  },
  cardInfo: {
    borderColor: "rgba(99, 102, 241, 0.2)",
    backgroundColor: "rgba(238, 242, 255, 0.7)",
  },
  cardDue: {
    borderColor: Theme.borderLight,
    backgroundColor: "#f8fafc",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  titleWarning: {
    color: Theme.warning,
  },
  body: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  bodyStrong: {
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  sub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 15,
  },
  duplicateHint: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.warning,
    lineHeight: 14,
  },
});
