import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  LedgerEntryReceiptCard,
  type LedgerEntryReceiptDetailRow,
} from "@/components/ledger/LedgerEntryReceiptCard";
import { LEDGER_RECEIPT } from "@/components/ledger/ledgerEntryReceiptPalette";
import Theme from "@/constants/Theme";
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
  const isIn = props.type === "in";
  const statusLabel = props.isEditMode
    ? isIn
      ? "Entry updated"
      : "Payout updated"
    : isIn
      ? "Payment received"
      : "Payment sent";
  const title = props.isEditMode
    ? isIn
      ? "Receivable updated"
      : "Payable updated"
    : isIn
      ? "Payment recorded"
      : "Payout recorded";

  const refLine =
    props.referenceSummary &&
    props.referenceSummary !== "—" &&
    props.referenceSummary !== "— (cash)"
      ? props.referenceSummary
      : null;

  const details: LedgerEntryReceiptDetailRow[] = [
    {
      label: "Party",
      value: props.partyName,
    },
  ];
  if (props.tripSummary && props.tripSummary !== "No voyage linked") {
    details.push({ label: "Voyage", value: props.tripSummary });
  }
  if (props.paymentModeLabel) {
    details.push({ label: "Payment mode", value: props.paymentModeLabel });
  }
  if (refLine) {
    details.push({ label: "Reference", value: refLine });
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <View style={styles.content}>
        <LedgerEntryReceiptCard
          statusLabel={statusLabel}
          title={title}
          amount={props.amount}
          isIn={isIn}
          partyAvatar={
            props.partyName
              ? {
                  name: props.partyName,
                  entityType: props.partyEntityType ?? "client",
                  avatarUrl: props.partyAvatarUrl,
                  avatarSeed: props.partyAvatarSeed,
                }
              : undefined
          }
          details={details}
        />
      </View>

      <Pressable style={styles.doneBtn} onPress={props.onDone}>
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    backgroundColor: LEDGER_RECEIPT.detailBg,
    paddingHorizontal: 16,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    width: "100%",
    minHeight: 0,
    paddingVertical: 4,
  },
  doneBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LEDGER_RECEIPT.primaryBtn,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnDark,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
