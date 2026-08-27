import { useLanguage } from "@/contexts/LanguageContext";
import { ScrollView, Text, TouchableOpacity } from "react-native";
import { TABS, type FinanceSubTab } from "../types";
import { styles } from "./FinanceScreen.styles";

const TAB_I18N_KEYS: Record<FinanceSubTab, string> = {
  cash: "tabCash",
  customers: "tabCustomers",
  suppliers: "tabSuppliers",
  garage: "tabGarage",
  drivers: "tabDrivers",
};

export interface FinanceTabRowProps {
  activeTab: FinanceSubTab;
  onTabPress: (tabId: FinanceSubTab) => void;
  /**
   * When embedded in `TreasurySummaryCard` topContent (negative horizontal margin),
   * apply horizontal inset so pills align with the summary card content.
   */
  treasuryInset?: boolean;
  /**
   * Mobile pinned tab bar: equal-width pills, left-aligned fill (not desktop right-dock).
   */
  mobileBar?: boolean;
  /** RBAC-filtered tabs; defaults to all fiscal tabs. */
  tabs?: readonly { id: FinanceSubTab; label: string }[];
}

export function FinanceTabRow({
  activeTab,
  onTabPress,
  treasuryInset = false,
  mobileBar = false,
  tabs = TABS,
}: FinanceTabRowProps) {
  const { t } = useLanguage();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.financeHeroPillsScroll}
      contentContainerStyle={[
        styles.financeHeroPillsRow,
        treasuryInset && styles.financeHeroPillsRowTreasuryInset,
        mobileBar && styles.financeHeroPillsRowMobile,
      ]}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.financeHeroPill,
              mobileBar && styles.financeHeroPillMobile,
              !isActive && styles.financeHeroPillInactive,
              isActive && styles.financeHeroPillActive,
            ]}
            onPress={() => onTabPress(tab.id)}
            activeOpacity={0.82}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                styles.financeHeroPillText,
                isActive && styles.financeHeroPillTextActive,
              ]}
              numberOfLines={1}
            >
              {t(TAB_I18N_KEYS[tab.id])}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
