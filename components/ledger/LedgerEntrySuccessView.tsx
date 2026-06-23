import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";

import { EntityAvatar } from "@/components/EntityAvatar";
import { LedgerTicketChrome } from "@/components/ledger/LedgerTicketChrome";
import Theme from "@/constants/Theme";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";

export interface LedgerEntrySuccessViewProps {
  isEditMode: boolean;
  type: "in" | "out";
  amount: number;
  partyName: string;
  partyEntityType?: PartyEntityType;
  partyAvatarUrl?: string | null;
  partyAvatarSeed?: string | null;
  partyIsIntegrated?: boolean;
  tripSummary?: string | null;
  paymentModeLabel?: string | null;
  referenceSummary?: string | null;
  onDone: () => void;
}

export const LedgerEntrySuccessView = memo(function LedgerEntrySuccessView(
  props: LedgerEntrySuccessViewProps,
) {
  const insets = useSafeAreaInsets();
  const accent = props.type === "in" ? Theme.darkGreen : Theme.teslaRed;
  const amountLabel = props.amount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const refLine =
    props.referenceSummary &&
    props.referenceSummary !== "—" &&
    props.referenceSummary !== "— (cash)"
      ? props.referenceSummary
      : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.content}>
        <LedgerTicketChrome
          headerKicker="PULSE LEDGER"
          headerCaption={props.isEditMode ? "Entry updated" : "Entry confirmed"}
          headerCode="SYNCED"
          headerColor={accent}
          notchBackdrop="#f1f5f9"
        >
          <View style={styles.successHero}>
            <View style={[styles.checkBadge, { backgroundColor: `${accent}18`, borderColor: accent }]}>
              <Check size={28} color={accent} strokeWidth={3} />
            </View>
            <Text style={styles.successTitle}>
              {props.isEditMode ? "Updated on books" : "Saved to books"}
            </Text>
            <Text style={[styles.amount, { color: accent }]}>₹{amountLabel}</Text>
            <Text style={styles.direction}>
              {props.type === "in" ? "Cash in" : "Cash out"}
            </Text>
          </View>

          <View style={styles.partyRow}>
            <EntityAvatar
              name={props.partyName}
              avatarUrl={props.partyAvatarUrl}
              avatarSeed={props.partyAvatarSeed}
              entityType={props.partyEntityType ?? "client"}
              isIntegrated={props.partyIsIntegrated}
              size={44}
              showIntegrationBadge={false}
            />
            <View style={styles.partyText}>
              <Text style={styles.fieldLabel}>Party</Text>
              <Text style={styles.partyName} numberOfLines={2}>
                {props.partyName}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {props.tripSummary && props.tripSummary !== "No voyage linked" ? (
            <View style={styles.detailRow}>
              <Text style={styles.fieldLabel}>Voyage</Text>
              <Text style={styles.fieldValue} numberOfLines={2}>
                {props.tripSummary}
              </Text>
            </View>
          ) : null}

          {props.paymentModeLabel ? (
            <View style={styles.detailRow}>
              <Text style={styles.fieldLabel}>Paid via</Text>
              <Text style={styles.fieldValue}>{props.paymentModeLabel}</Text>
            </View>
          ) : null}

          {refLine ? (
            <View style={styles.detailRow}>
              <Text style={styles.fieldLabel}>Reference</Text>
              <Text style={styles.fieldValue}>{refLine}</Text>
            </View>
          ) : null}

          <Text style={styles.finePrint}>
            This entry is live in your ledger. Share receipts from the trip or party screen if needed.
          </Text>
        </LedgerTicketChrome>
      </View>

      <Pressable style={[styles.doneBtn, { backgroundColor: accent }]} onPress={props.onDone}>
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 16,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    width: "100%",
    minHeight: 0,
    paddingVertical: 8,
  },
  successHero: {
    alignItems: "center",
    gap: 6,
    paddingBottom: 4,
  },
  checkBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  amount: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  direction: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
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
  detailRow: { gap: 3 },
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
    color: Theme.textMuted,
  },
  fieldValue: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 13,
    lineHeight: 18,
  },
  finePrint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "italic",
    lineHeight: 14,
    marginTop: 2,
  },
  doneBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.3,
  },
});
