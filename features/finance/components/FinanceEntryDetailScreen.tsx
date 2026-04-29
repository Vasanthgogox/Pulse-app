import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LedgerExpandedCardFromData, type FinancialRowData } from "./FinancialRow";

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
  onDownloadPress,
  onOpenCompareVerify,
  embedded = false,
}: FinanceEntryDetailScreenProps) {
  const insets = useSafeAreaInsets();

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
          <LedgerExpandedCardFromData
            data={data}
            onDownloadPress={onDownloadPress}
            onOpenCompareVerify={onOpenCompareVerify}
          />
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
        <LedgerExpandedCardFromData
          data={data}
          onDownloadPress={onDownloadPress}
          onOpenCompareVerify={onOpenCompareVerify}
        />
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
    paddingTop: 0,
  },
});
