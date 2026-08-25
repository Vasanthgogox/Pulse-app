/**
 * Mobile loads hub chrome — uses shared hub mobile chrome (aligned with Trips).
 */
import Theme from "@/constants/Theme";
import { LoadCenterUnderlineTabStrip } from "@/features/network/components/LoadCenterUnderlineTabStrip";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { PulsePillButton } from "@/components/PulsePillButton";
import {
  HubMobileScreenHeader,
  HubMobileSearchRow,
  hubMobileChromeStyles as chrome,
} from "@/components/hub";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/** Soft slate canvas — white ticket cards need this contrast to read. */
export const LOADS_HUB_PAGE_BG = "#F0F2F5";

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
  const { can: canSurface } = useMemberAccess();
  const canCreateIndent = canSurface("tripops.indents.create");

  return (
    <View style={chrome.shell}>
      <HubMobileScreenHeader
        title="My Loads"
        action={
          canCreateIndent ? (
            <PulsePillButton
              label="Add Load"
              showPlusIcon
              size="compact"
              onPress={onCreateIndentPress}
              accessibilityLabel="Add load"
            />
          ) : undefined
        }
      />

      <View style={chrome.tabHeaderRow}>
        <TouchableOpacity
          style={[
            chrome.filterBtn,
            (searchOpen || hasSearchQuery) && chrome.filterBtnActive,
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
          style={chrome.primaryTabsScroll}
          contentStyle={chrome.primaryTabsContent}
        />
      </View>

      <View style={chrome.tabDivider} />

      {searchOpen ? (
        <HubMobileSearchRow
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search route, indent, client…"
          accessibilityLabel="Search loads"
        />
      ) : null}

      {showStatusTabs && statusTabs.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            chrome.metricTabsContent,
            showDoneSubTabs && chrome.metricTabsContentSpread,
          ]}
          style={chrome.metricTabsScroll}
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
            <View style={chrome.metricTabDivider} />
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
              style={styles.doneSubTabGroup}
            />
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  doneSubTabGroup: {
    marginLeft: "auto",
  },
});
