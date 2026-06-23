/**
 * Mobile loads hub chrome — matches Trips mobile header (title, add pill, underline tabs).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { LoadCenterUnderlineTabStrip } from "@/features/network/components/LoadCenterUnderlineTabStrip";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { PulsePillButton } from "@/components/PulsePillButton";
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

export const LOADS_HUB_PAGE_BG = Theme.screenBackground;

const SEARCH_FONT_SIZE = 13;
const SEARCH_LINE_HEIGHT = 18;
const SEARCH_ROW_HEIGHT = 34;

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

type DoneSubTabItem = {
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
  doneSubTabs,
  activeDoneSubTab,
  onDoneSubTabChange,
  showDoneSubTabs = false,
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
  doneSubTabs?: DoneSubTabItem[];
  activeDoneSubTab?: string;
  onDoneSubTabChange?: (id: string) => void;
  showDoneSubTabs?: boolean;
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
        <PulsePillButton
          label="Add Load"
          showPlusIcon
          size="compact"
          onPress={onCreateIndentPress}
          accessibilityLabel="Add load"
        />
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
                ? Theme.loadMainTabBorder
                : Theme.textPrimaryDark
            }
          />
        </TouchableOpacity>
        <LoadCenterUnderlineTabStrip
          variant="yellow"
          scrollable
          tabs={mainTabs}
          activeKey={activeMainTab}
          onChange={(key) => onMainTabChange(key as MainTab["key"])}
          formatLabel={(label, count) => `${label} (${count})`}
          style={styles.mmtPrimaryTabsScroll}
          contentStyle={styles.mmtPrimaryTabsContent}
        />
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
          contentContainerStyle={[
            styles.mmtMetricTabsContent,
            showDoneSubTabs && styles.mmtMetricTabsContentSpread,
          ]}
          style={styles.mmtMetricTabsScroll}
        >
          <LoadCenterUnderlineTabStrip
            variant="blue"
            compact
            tabs={statusTabs.map((tab) => ({
              key: tab.id,
              label: tab.label,
              count: tab.count,
            }))}
            activeKey={activeStatusTab}
            onChange={onStatusTabChange}
            formatLabel={(label, count) => `${label} (${count})`}
          />
          {showDoneSubTabs && doneSubTabs?.length ? (
            <View style={styles.mmtMetricTabDivider} />
          ) : null}
          {showDoneSubTabs && doneSubTabs && onDoneSubTabChange ? (
            <LoadCenterUnderlineTabStrip
              variant="pink"
              compact
              tabs={doneSubTabs.map((tab) => ({
                key: tab.id,
                label: tab.label,
                count: tab.count,
              }))}
              activeKey={activeDoneSubTab ?? ""}
              onChange={onDoneSubTabChange}
              formatLabel={(label, count) => `${label} (${count})`}
              style={styles.mmtDoneSubTabGroup}
            />
          ) : null}
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
    paddingBottom: 0,
    gap: 0,
  },
  mmtMetricTabsContentSpread: {
    flexGrow: 1,
    justifyContent: "space-between",
  },
  mmtDoneSubTabGroup: {
    marginLeft: "auto",
  },
  mmtMetricTabDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginVertical: 4,
    marginHorizontal: 2,
  },
});
