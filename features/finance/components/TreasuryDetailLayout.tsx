/**
 * Shared detail-page layout: black header (TeslaHeader) + optional black card (tabs + summary + search).
 * Use for all entity/trip detail screens so they match the Treasury Financial Summary UI globally.
 */
import { TeslaHeader } from "@/components/navigation/TeslaHeader";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TreasurySummaryCard } from "./TreasurySummaryCard";

export interface TreasuryDetailLayoutProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack: () => void;
  onLoadClick?: () => void;
  onNetworkClick?: () => void;
  onNotificationClick?: () => void;
  onProfileClick?: () => void;
  /** Optional pull-to-refresh. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Rendered at top of black card (e.g. DETAIL | COMPARE & VERIFY tabs). */
  topContent?: ReactNode;
  /** When set, shows the black summary card (Total In/Out, search, report) below header. */
  summaryCard?: {
    totalIn: number;
    totalOut: number;
    labelIn: string;
    labelOut: string;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    searchPlaceholder?: string;
    onReportPress: () => void;
  };
  children: ReactNode;
  /** Optional FAB or other fixed bottom-right content. */
  fab?: ReactNode;
  /** When set, shows plus button in header (e.g. Add transaction). Replaces floating FAB. */
  onAddClick?: () => void;
}

export function TreasuryDetailLayout({
  title,
  subtitle,
  showBack = true,
  onBack,
  onLoadClick,
  onNetworkClick,
  onNotificationClick,
  onProfileClick,
  onRefresh,
  refreshing = false,
  topContent,
  summaryCard,
  children,
  fab,
  onAddClick,
}: TreasuryDetailLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.darkBlock, { paddingTop: insets.top }]}>
        <TeslaHeader
          title={title}
          subtitle={subtitle}
          variant="dark"
          showBack={showBack}
          onBack={onBack}
          onLoadClick={onLoadClick}
          onNetworkClick={onNetworkClick}
          onNotificationClick={onNotificationClick}
          onProfileClick={onProfileClick}
          onAddClick={onAddClick}
          skipSafeAreaTop
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.textOnDark} />
          ) : undefined
        }
      >
        {summaryCard != null ? (
          <View style={styles.cardWrapNoGap}>
            <TreasurySummaryCard
              fullWidth
              topContent={topContent}
              totalIn={summaryCard.totalIn}
              totalOut={summaryCard.totalOut}
              labelIn={summaryCard.labelIn}
              labelOut={summaryCard.labelOut}
              searchQuery={summaryCard.searchQuery}
              onSearchChange={summaryCard.onSearchChange}
              searchPlaceholder={summaryCard.searchPlaceholder ?? "Search trip, destination…"}
              onReportPress={summaryCard.onReportPress}
            />
          </View>
        ) : topContent != null ? (
          <View style={styles.cardWrapNoGap}>
            <View style={styles.darkCardShell}>{topContent}</View>
          </View>
        ) : null}

        <View style={styles.contentBlock}>{children}</View>
      </ScrollView>

      {fab}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  darkBlock: {
    backgroundColor: Theme.darkBackground,
    width: "100%",
    paddingBottom: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  scroll: { flex: 1 },
  scrollContent: { backgroundColor: Theme.screenBackground },
  cardWrapNoGap: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  cardWrapOnlyTabs: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  contentBlock: {
    paddingTop: Layout.sectionSpacing,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
  },
  darkCardShell: {
    backgroundColor: Theme.darkBackground,
    marginHorizontal: 0,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    overflow: "hidden",
    padding: 12,
    paddingBottom: 10,
  },
});
