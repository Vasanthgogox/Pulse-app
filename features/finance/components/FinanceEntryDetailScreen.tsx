import { LedgerEntryReceiptCard } from "@/components/ledger/LedgerEntryReceiptCard";
import Theme from "@/constants/Theme";
import type { FinancialRowData } from "@/features/finance/components/FinancialRow";
import { ledgerReceiptFromFinancialRowData } from "@/features/finance/utils/ledgerTransactionReceipt.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface FinanceEntryDetailScreenProps {
  data: FinancialRowData;
  onBack: () => void;
  onDownloadPress?: () => void;
  onOpenCompareVerify?: () => void;
  embedded?: boolean;
  onViewTripDetail?: () => void;
}

export function FinanceEntryDetailScreen({
  data,
  onBack,
  embedded = false,
  onViewTripDetail,
}: FinanceEntryDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const receipt = ledgerReceiptFromFinancialRowData(data);
  const showViewAll = Boolean(onViewTripDetail && receipt.tripId);

  const receiptCard = (
    <LedgerEntryReceiptCard
      desktop={isDesktop}
      statusLabel={receipt.statusLabel}
      title={receipt.title}
      amount={receipt.amount}
      isIn={receipt.isIn}
      partyAvatar={receipt.partyAvatar}
      details={receipt.details}
      secondaryAction={showViewAll ? { label: "Close", onPress: onBack } : undefined}
      primaryAction={
        showViewAll
          ? {
              label: "View all on trip",
              onPress: () => {
                onBack();
                onViewTripDetail?.();
              },
            }
          : { label: "Done", onPress: onBack }
      }
    />
  );

  if (embedded) {
    return (
      <View style={[styles.root, styles.rootEmbedded]}>
        <ScrollView
          style={styles.embeddedScroll}
          contentContainerStyle={styles.embeddedScrollContent}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.receiptCenter}>{receiptCard}</View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      <View style={[styles.topRow, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          activeOpacity={0.85}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <FontAwesome name="chevron-left" size={14} color={Theme.textPrimaryDark} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.receiptCenter}>{receiptCard}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  rootEmbedded: {
    backgroundColor: Theme.screenBackground,
  },
  embeddedScroll: {
    flex: 1,
  },
  embeddedScrollContent: {
    paddingBottom: 8,
    flexGrow: 1,
    justifyContent: "center",
  },
  topRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  receiptCenter: {
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
  },
});
