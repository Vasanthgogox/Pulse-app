/**
 * Mobile loads hub chrome — matches Trips mobile header (title, add pill, underline tabs).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export const LOADS_HUB_PAGE_BG = "#eef2f6";
export const LOADS_HUB_ACCENT = Theme.pulseIndigo;

const SEARCH_FONT_SIZE = 13;
const SEARCH_LINE_HEIGHT = 18;
const SEARCH_ROW_HEIGHT = 34;

export function LoadHubMmtUnderlineTab({
  label,
  isActive,
  onPress,
  compact,
  accessibilityLabel,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.mmtTabItem, compact && styles.mmtTabItemCompact]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          styles.mmtTabLabel,
          compact && styles.mmtTabLabelCompact,
          isActive && styles.mmtTabLabelActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {isActive ? (
        <View
          style={[styles.mmtTabUnderline, compact && styles.mmtTabUnderlineCompact]}
        />
      ) : null}
    </TouchableOpacity>
  );
}

type MainTab = {
  key: "GIVE_LOAD" | "GET_LOAD" | "AWARDED";
  label: string;
  count: number;
};

type StatusTab = {
  id: string;
  label: string;
  count: number;
};

export function LoadCenterHubMobileShell({
  searchQuery,
  onSearchChange,
  mainTabs,
  activeMainTab,
  onMainTabChange,
  statusTabs,
  activeStatusTab,
  onStatusTabChange,
  showStatusTabs,
  onCreateIndentPress,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  mainTabs: MainTab[];
  activeMainTab: MainTab["key"];
  onMainTabChange: (key: MainTab["key"]) => void;
  statusTabs: StatusTab[];
  activeStatusTab: string;
  onStatusTabChange: (id: string) => void;
  showStatusTabs: boolean;
  onCreateIndentPress: () => void;
}) {
  const searchInputRef = useRef<TextInput>(null);
  const [searchOpen, setSearchOpen] = useState(() => searchQuery.trim().length > 0);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setSearchOpen(true);
    }
  }, [searchQuery]);

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const closeSearch = () => {
    setSearchOpen(false);
    searchInputRef.current?.blur();
  };

  const toggleSearch = () => {
    if (searchOpen) {
      closeSearch();
    } else {
      openSearch();
    }
  };

  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <View style={styles.shell}>
      {/* Row 1 — title + add (matches Trips mobile header) */}
      <View style={styles.mmtScreenHeaderRow}>
        <Text style={styles.mmtScreenTitle}>My Loads</Text>
        <TouchableOpacity
          style={styles.mmtAddBtn}
          onPress={onCreateIndentPress}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Add load"
        >
          <View style={styles.mmtAddIconBadge}>
            <FontAwesome name="cube" size={9} color={LOADS_HUB_ACCENT} />
          </View>
          <Text style={styles.mmtAddText}>Add Load</Text>
        </TouchableOpacity>
      </View>

      {/* Row 2 — search + primary tabs (matches Trips filter + Active/History row) */}
      <View style={styles.mmtTabHeaderRow}>
        <TouchableOpacity
          style={[
            styles.mmtFilterBtn,
            (searchOpen || hasSearchQuery) && styles.mmtFilterBtnActive,
          ]}
          onPress={toggleSearch}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? "Close search" : "Search loads"}
          accessibilityState={{ selected: searchOpen || hasSearchQuery }}
        >
          <FontAwesome
            name="search"
            size={15}
            color={
              searchOpen || hasSearchQuery
                ? LOADS_HUB_ACCENT
                : Theme.textPrimaryDark
            }
          />
        </TouchableOpacity>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentContainerStyle={styles.mmtPrimaryTabsContent}
          style={styles.mmtPrimaryTabsScroll}
        >
          {mainTabs.map((tab) => (
            <LoadHubMmtUnderlineTab
              key={tab.key}
              label={`${tab.label}${tab.count > 0 ? ` (${tab.count})` : ""}`}
              isActive={activeMainTab === tab.key}
              onPress={() => onMainTabChange(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.mmtTabDivider} />

      {searchOpen ? (
        <View style={styles.searchRow}>
          <FontAwesome
            name="search"
            size={13}
            color={Theme.textMuted}
            style={styles.searchLeadingIcon}
          />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search route, indent, client…"
            placeholderTextColor={Theme.textMuted}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search loads"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => onSearchChange("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <FontAwesome name="times-circle" size={14} color={Theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {showStatusTabs && statusTabs.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.mmtMetricTabsContent}
          style={styles.mmtMetricTabsScroll}
        >
          {statusTabs.map((tab) => (
            <LoadHubMmtUnderlineTab
              key={tab.id}
              label={`${tab.label} (${tab.count})`}
              isActive={activeStatusTab === tab.id}
              compact
              onPress={() => onStatusTabChange(tab.id)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: Theme.screenBackground,
  },
  mmtScreenHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 10,
    gap: 12,
  },
  mmtScreenTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
  },
  mmtAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
    height: 28,
    paddingLeft: 4,
    paddingRight: 9,
    borderRadius: 14,
    backgroundColor: LOADS_HUB_ACCENT,
    borderWidth: 1,
    borderColor: LOADS_HUB_ACCENT,
    shadowColor: LOADS_HUB_ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  mmtAddIconBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.textOnPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  mmtAddText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: -0.1,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    height: SEARCH_ROW_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingLeft: 10,
    paddingRight: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  searchLeadingIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: SEARCH_FONT_SIZE,
    lineHeight: SEARCH_LINE_HEIGHT,
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    height: SEARCH_LINE_HEIGHT,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  mmtTabHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 36,
  },
  mmtFilterBtn: {
    width: 34,
    height: 34,
    marginRight: 2,
    marginBottom: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  mmtFilterBtnActive: {
    borderRadius: 10,
    backgroundColor: Theme.pulseTabActiveBg,
  },
  mmtPrimaryTabsScroll: {
    flex: 1,
    minWidth: 0,
  },
  mmtPrimaryTabsContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingRight: 4,
  },
  mmtTabItem: {
    position: "relative",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    marginRight: 2,
    justifyContent: "flex-end",
    minHeight: 34,
  },
  mmtTabItemCompact: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 7,
    minHeight: 30,
    marginRight: 0,
  },
  mmtTabLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textRouteCard,
    letterSpacing: -0.2,
  },
  mmtTabLabelCompact: {
    fontSize: 11,
    letterSpacing: -0.25,
  },
  mmtTabLabelActive: {
    fontWeight: "600",
    color: LOADS_HUB_ACCENT,
  },
  mmtTabUnderline: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: LOADS_HUB_ACCENT,
  },
  mmtTabUnderlineCompact: {
    left: 8,
    right: 8,
    height: 2,
  },
  mmtTabDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginBottom: 0,
  },
  mmtMetricTabsScroll: {
    minWidth: 0,
    alignSelf: "stretch",
    marginTop: 2,
    marginBottom: 2,
  },
  mmtMetricTabsContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingRight: 4,
  },
});
