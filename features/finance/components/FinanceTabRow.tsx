import { useLanguage } from "@/contexts/LanguageContext";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { MIN_FISCAL_TAB_WIDTH, TABS, type FinanceSubTab } from "../types";
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
  screenWidth: number;
}

export function FinanceTabRow({
  activeTab,
  onTabPress,
  screenWidth,
}: FinanceTabRowProps) {
  const { t } = useLanguage();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.fiscalTabScroll}
      contentContainerStyle={[
        styles.fiscalTabRow,
        {
          minWidth: Math.max(screenWidth, TABS.length * MIN_FISCAL_TAB_WIDTH),
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.fiscalTab, isActive && styles.fiscalTabActive]}
            onPress={() => onTabPress(tab.id)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.fiscalTabText,
                isActive && styles.fiscalTabTextActive,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {t(TAB_I18N_KEYS[tab.id])}
            </Text>
            {isActive && <View style={styles.fiscalTabUnderline} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
