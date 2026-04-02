import FontAwesome from "@expo/vector-icons/FontAwesome";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { Pressable, Text, View } from "react-native";
import type { LedgerCategory } from "../types";
import { styles } from "./FinanceScreen.styles";

export interface LedgerCategoryFilterBannerProps {
  selectedLedgerCategory: LedgerCategory;
  selectedEntityTotals: {
    totalIn: number;
    totalOut: number;
    count: number;
  } | null;
  onClearCategory: () => void;
}

const CATEGORY_I18N_KEYS: Record<Exclude<LedgerCategory, "all">, string> = {
  customers: "tabCustomers",
  suppliers: "tabSuppliers",
  vehicle: "vehicle",
  driver: "driver",
};

export function LedgerCategoryFilterBanner({
  selectedLedgerCategory,
  selectedEntityTotals,
  onClearCategory,
}: LedgerCategoryFilterBannerProps) {
  const { t } = useLanguage();
  const categoryLabel =
    selectedLedgerCategory === "all"
      ? t("all")
      : t(CATEGORY_I18N_KEYS[selectedLedgerCategory]);
  return (
    <View style={styles.ledgerEntityFilterBanner}>
      <View style={styles.ledgerEntityFilterBannerAccent} />
      <View style={styles.ledgerEntityFilterBannerContent}>
        <View style={styles.ledgerEntityFilterLabelRow}>
          <View style={styles.ledgerEntityFilterIconWrap}>
            <FontAwesome name="filter" size={11} color={Theme.teslaRed} />
          </View>
          <Text style={styles.ledgerEntityFilterLabel}>{t("category")}</Text>
          <View style={styles.ledgerEntityFilterBadge}>
            <Text style={styles.ledgerEntityFilterText} numberOfLines={1}>
              {categoryLabel}
            </Text>
          </View>
        </View>
        {selectedEntityTotals != null && (
          <>
            <View style={styles.ledgerEntityFilterStatsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.ledgerEntityFilterStat,
                  pressed && styles.ledgerEntityFilterStatPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${selectedEntityTotals.count} transactions`}
              >
                <Text style={styles.ledgerEntityFilterStatValue}>
                  {selectedEntityTotals.count}
                </Text>
                <Text style={styles.ledgerEntityFilterStatUnit}>tx</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.ledgerEntityFilterStat,
                  styles.ledgerEntityFilterStatIn,
                  pressed && styles.ledgerEntityFilterStatPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t("totalCashIn")} ${selectedEntityTotals.totalIn.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
              >
                <FontAwesome name="arrow-up" size={9} color={Theme.darkGreen} />
                <Text style={styles.ledgerEntityFilterStatAmountGreen}>
                  ₹
                  {selectedEntityTotals.totalIn.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.ledgerEntityFilterStat,
                  styles.ledgerEntityFilterStatOut,
                  pressed && styles.ledgerEntityFilterStatPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t("totalCashOut")} ${selectedEntityTotals.totalOut.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
              >
                <FontAwesome name="arrow-down" size={9} color={Theme.teslaRed} />
                <Text style={styles.ledgerEntityFilterStatAmountRed}>
                  ₹
                  {selectedEntityTotals.totalOut.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </Text>
              </Pressable>
            </View>
            {selectedEntityTotals.totalIn + selectedEntityTotals.totalOut >
              0 && (
              <View style={styles.ledgerEntityFilterRatioBarWrap}>
                <View
                  style={[
                    styles.ledgerEntityFilterRatioBarIn,
                    {
                      flex: selectedEntityTotals.totalIn,
                    },
                  ]}
                  accessibilityLabel={t("cashInShare")}
                  accessibilityRole="none"
                />
                <View
                  style={[
                    styles.ledgerEntityFilterRatioBarOut,
                    {
                      flex: selectedEntityTotals.totalOut,
                    },
                  ]}
                  accessibilityLabel={t("cashOutShare")}
                  accessibilityRole="none"
                />
              </View>
            )}
          </>
        )}
      </View>
      <Pressable
        onPress={onClearCategory}
        hitSlop={12}
        style={({ pressed }) => [
          styles.ledgerEntityFilterClear,
          pressed && styles.ledgerEntityFilterClearPressed,
        ]}
        accessibilityLabel={t("clearCategoryFilter")}
        accessibilityRole="button"
      >
        <FontAwesome name="times" size={10} color={Theme.textOnDark} />
        <Text style={styles.ledgerEntityFilterClearText}>{t("clear")}</Text>
      </Pressable>
    </View>
  );
}
