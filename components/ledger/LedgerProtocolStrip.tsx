/**
 * SYNC MODE / PAYMENT TYPE workbench — aligned rows, shared tile geometry.
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { memo, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import type { LedgerProtocolStripVariant } from "@/components/ledger/ledgerPaymentVisuals";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";

export const LEDGER_PROTOCOL_TILE_GAP = {
  desktop: 6,
  compact: 5,
} as const;

export type LedgerProtocolStripSectionProps = {
  title: string;
  variant?: LedgerProtocolStripVariant;
  stripOpen: boolean;
  onExpand: () => void;
  summaryIcon: ReactNode;
  summaryLabel: string;
  usesScroll: boolean;
  tileGap: number;
  centerRow?: boolean;
  children: ReactNode;
  sectionStyle?: StyleProp<ViewStyle>;
};

export const LedgerProtocolStripSection = memo(function LedgerProtocolStripSection({
  title,
  variant = "desktop",
  stripOpen,
  onExpand,
  summaryIcon,
  summaryLabel,
  usesScroll,
  tileGap,
  centerRow = false,
  children,
  sectionStyle,
}: LedgerProtocolStripSectionProps) {
  const compact = variant === "compact";

  const rowContent = (
    <View
      style={[
        styles.row,
        centerRow && styles.rowCentered,
        !usesScroll && styles.rowFullWidth,
        { gap: tileGap },
      ]}
    >
      {children}
    </View>
  );

  return (
    <View style={[styles.section, sectionStyle]}>
      <View style={[styles.headerRow, compact && styles.headerRowCompact]}>
        <Text
          style={[styles.headerTitle, compact && styles.headerTitleCompact]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
        {!stripOpen ? (
          <TouchableOpacity
            style={[styles.changeBtn, compact && styles.changeBtnCompact]}
            onPress={onExpand}
            activeOpacity={0.8}
          >
            <Text style={[styles.changeBtnText, compact && styles.changeBtnTextCompact]}>
              Change
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!stripOpen && summaryLabel ? (
        <TouchableOpacity
          style={[styles.summaryCard, compact && styles.summaryCardCompact]}
          onPress={onExpand}
          activeOpacity={0.85}
        >
          <View style={styles.summaryMain}>
            <View style={[styles.summaryIcon, compact && styles.summaryIconCompact]}>
              {summaryIcon}
            </View>
            <Text
              style={[styles.summaryText, compact && styles.summaryTextCompact]}
              numberOfLines={2}
            >
              {summaryLabel}
            </Text>
          </View>
          <FontAwesome name="chevron-down" size={10} color={Theme.textMutedDemo} />
        </TouchableOpacity>
      ) : stripOpen ? (
        usesScroll ? (
          <ScrollView
            horizontal
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator
            style={styles.scroll}
            contentContainerStyle={[styles.row, { gap: tileGap, paddingVertical: 1 }]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={styles.scroll}>{rowContent}</View>
        )
      ) : null}
    </View>
  );
});

/** Outer card wrapping both SYNC MODE and PAYMENT TYPE sections. */
export const LedgerProtocolWorkbench = memo(function LedgerProtocolWorkbench({
  stacked,
  compact,
  children,
}: {
  stacked?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        styles.workbench,
        stacked && styles.workbenchStacked,
        compact && styles.workbenchCompact,
      ]}
    >
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  workbench: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 16,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  workbenchStacked: {
    flexDirection: "column",
    gap: 10,
    paddingVertical: 12,
  },
  workbenchCompact: {
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  section: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  headerRowCompact: {
    marginBottom: 6,
  },
  headerTitle: {
    ...FinanceTxnTypography.chipLabel,
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.8,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  headerTitleCompact: {
    fontSize: 9,
    lineHeight: 11,
  },
  changeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
  },
  changeBtnCompact: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  changeBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
  },
  changeBtnTextCompact: {
    fontSize: 9,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  summaryCardCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  summaryMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  summaryIconCompact: {
    width: 20,
    height: 20,
  },
  summaryText: {
    ...FinanceTxnTypography.partyTitle,
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: Theme.textPrimary,
    textTransform: "none",
  },
  summaryTextCompact: {
    fontSize: 11,
  },
  scroll: {
    width: "100%",
    flexGrow: 0,
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  rowFullWidth: {
    width: "100%",
  },
  rowCentered: {
    justifyContent: "center",
  },
});
