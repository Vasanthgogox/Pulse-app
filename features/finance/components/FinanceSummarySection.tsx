/**
 * Treasury header + tab row + summary card (totals, search, filters).
 */
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import type { FinanceSubTab } from "../types";
import { styles } from "./FinanceScreen.styles";
import { FinanceTabRow } from "./FinanceTabRow";
import type { EntityListFilter } from "./TreasurySummaryCard";
import { TreasurySummaryCard } from "./TreasurySummaryCard";
import type { LedgerCategory } from "../types";

export type LedgerViewMode = "table" | "transaction";

export interface FinanceSummarySectionProps {
  /** Header title (e.g. translated "Treasury"). */
  title?: string;
  /** Header subtitle (e.g. translated "Fiscal Matrix"). */
  subtitle?: string;
  activeTab: FinanceSubTab;
  onTabPress: (tabId: FinanceSubTab) => void;
  screenWidth: number;
  totalIn: number;
  totalOut: number;
  labelIn: string;
  labelOut: string;
  cashDirectionFilter?: "all" | "in" | "out";
  onCashInPress?: () => void;
  onCashOutPress?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  onReportPress: () => void;
  entityFilter?: EntityListFilter;
  onEntityFilterChange?: (f: EntityListFilter) => void;
  entityFilterLabels?: Partial<Record<EntityListFilter, string>>;
  garagePeriodOptions?: { value: string; label: string }[];
  garagePeriod?: string;
  onGaragePeriodChange?: (v: string) => void;
  garageViewTab?: "vehicle" | "trips" | "revenue" | "profit";
  onGarageViewTabChange?: (v: "vehicle" | "trips" | "revenue" | "profit") => void;
  showPeriodFilter?: boolean;
  periodFilter?: "TODAY" | "MONTH" | "RANGE";
  onPeriodFilterChange?: (p: "TODAY" | "MONTH" | "RANGE") => void;
  sourceFilter?: "all" | "asset" | "aggregate";
  onSourceFilterChange?: (s: "all" | "asset" | "aggregate") => void;
  /** Ledger tab: Table | Transaction view. Shown in header when on Ledger. */
  ledgerViewMode?: LedgerViewMode;
  onLedgerViewModeChange?: (m: LedgerViewMode) => void;
  /** Customers tab only: view mode (matrix / table / ledger) — shown in summary. */
  customerViewMode?: "matrix" | "table" | "ledger";
  onCustomerViewModeChange?: (m: "matrix" | "table" | "ledger") => void;
  /** When set, shows plus button in header (e.g. Add transaction on cash tab, Add node on entity tabs). */
  onAddClick?: () => void;
  /** Cash tab: party category filter (All / Customers / Suppliers / Vehicle / Driver). */
  ledgerCategory?: LedgerCategory;
  onLedgerCategoryChange?: (c: LedgerCategory) => void;
  onClearFilters?: () => void;
  isAnyFilterActive?: boolean;
}

export function FinanceSummarySection({
  title = "Treasury",
  subtitle = "Fiscal Matrix",
  activeTab,
  onTabPress,
  screenWidth,
  totalIn,
  totalOut,
  labelIn,
  labelOut,
  cashDirectionFilter,
  onCashInPress,
  onCashOutPress,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  onReportPress,
  entityFilter,
  onEntityFilterChange,
  entityFilterLabels,
  garagePeriodOptions,
  garagePeriod,
  onGaragePeriodChange,
  garageViewTab,
  onGarageViewTabChange,
  showPeriodFilter,
  periodFilter,
  onPeriodFilterChange,
  sourceFilter,
  onSourceFilterChange,
  ledgerViewMode,
  onLedgerViewModeChange,
  customerViewMode,
  onCustomerViewModeChange,
  onAddClick,
  ledgerCategory,
  onLedgerCategoryChange,
  onClearFilters,
  isAnyFilterActive,
}: FinanceSummarySectionProps) {
  const router = useRouter();
  const { t } = useLanguage();
  return (
    <View style={[styles.darkBlock, { paddingTop: 0 }]}>
      <View style={styles.darkBlockContent}>
        <TreasurySummaryCard
          fullWidth
          topContent={
            <>
              <FinanceTabRow
                activeTab={activeTab}
                onTabPress={onTabPress}
                screenWidth={screenWidth}
              />
              {(activeTab as FinanceSubTab | "ledger") === "ledger" &&
                onLedgerViewModeChange != null &&
                ledgerViewMode != null && (
                <View style={styles.ledgerViewModeRow}>
                  <TouchableOpacity
                    style={[
                      styles.ledgerViewModePill,
                      ledgerViewMode === "table" && styles.ledgerViewModePillActive,
                    ]}
                    onPress={() => onLedgerViewModeChange("table")}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.ledgerViewModePillText,
                        ledgerViewMode === "table" && styles.ledgerViewModePillTextActive,
                      ]}
                    >
                      {t("tableView")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.ledgerViewModePill,
                      ledgerViewMode === "transaction" && styles.ledgerViewModePillActive,
                    ]}
                    onPress={() => onLedgerViewModeChange("transaction")}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.ledgerViewModePillText,
                        ledgerViewMode === "transaction" && styles.ledgerViewModePillTextActive,
                      ]}
                    >
                      {t("transactionView")}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          }
          filterRowRight={
            activeTab === "customers" &&
            onCustomerViewModeChange != null &&
            customerViewMode != null
              ? (() => {
                  const active = (m: "matrix" | "table" | "ledger") =>
                    customerViewMode === m ? Theme.textOnDark : Theme.textOnDarkMuted;
                  return (
                    <>
                      <TouchableOpacity
                        style={[
                          styles.customerViewModeIconPill,
                          customerViewMode === "matrix" && styles.ledgerViewModePillActive,
                        ]}
                        onPress={() => onCustomerViewModeChange("matrix")}
                        activeOpacity={0.8}
                        accessibilityLabel={t("matrix")}
                        accessibilityRole="button"
                      >
                        <FontAwesome name="th-large" size={11} color={active("matrix")} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.customerViewModeIconPill,
                          customerViewMode === "table" && styles.ledgerViewModePillActive,
                        ]}
                        onPress={() => onCustomerViewModeChange("table")}
                        activeOpacity={0.8}
                        accessibilityLabel={t("tableView")}
                        accessibilityRole="button"
                      >
                        <FontAwesome name="table" size={11} color={active("table")} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.customerViewModeIconPill,
                          customerViewMode === "ledger" && styles.ledgerViewModePillActive,
                        ]}
                        onPress={() => onCustomerViewModeChange("ledger")}
                        activeOpacity={0.8}
                        accessibilityLabel={t("ledger")}
                        accessibilityRole="button"
                      >
                        <FontAwesome name="list" size={11} color={active("ledger")} />
                      </TouchableOpacity>
                    </>
                  );
                })()
              : undefined
          }
          totalIn={totalIn}
          totalOut={totalOut}
          labelIn={labelIn}
          labelOut={labelOut}
          cashDirectionFilter={cashDirectionFilter}
          onCashInPress={onCashInPress}
          onCashOutPress={onCashOutPress}
          ledgerCategory={ledgerCategory}
          onLedgerCategoryChange={onLedgerCategoryChange}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          onReportPress={onReportPress}
          entityFilter={entityFilter}
          onEntityFilterChange={onEntityFilterChange}
          entityFilterLabels={entityFilterLabels}
          garagePeriodOptions={garagePeriodOptions}
          garagePeriod={garagePeriod}
          onGaragePeriodChange={onGaragePeriodChange}
          garageViewTab={garageViewTab}
          onGarageViewTabChange={onGarageViewTabChange}
          showPeriodFilter={showPeriodFilter}
          periodFilter={periodFilter}
          onPeriodFilterChange={onPeriodFilterChange}
          sourceFilter={sourceFilter}
          onSourceFilterChange={onSourceFilterChange}
          amountAnimationResetKey={activeTab}
          cashNetworkLayout={
            activeTab === "cash" ||
            activeTab === "customers" ||
            activeTab === "suppliers" ||
            activeTab === "garage" ||
            activeTab === "drivers"
          }
          onClearFilters={onClearFilters}
          isAnyFilterActive={isAnyFilterActive}
        />
      </View>
    </View>
  );
}
