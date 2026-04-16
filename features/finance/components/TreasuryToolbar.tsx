/**
 * Tesla-style toolbar: search bar, filter dropdown, report icon.
 * Renders between summary banner and table header on Treasury (Finance) screen.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';

export type EntityListFilter = 'all' | 'has_due' | 'no_due';

export interface TreasuryToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  /** For entity tabs (customers, suppliers, garage, drivers). When undefined, filter control is hidden. */
  entityFilter?: EntityListFilter;
  onEntityFilterChange?: (f: EntityListFilter) => void;
  /** Ledger period filter shown only when showPeriodFilter true (ledger tab). */
  showPeriodFilter?: boolean;
  periodFilter?: 'TODAY' | 'MONTH' | 'RANGE';
  onPeriodFilterChange?: (p: 'TODAY' | 'MONTH' | 'RANGE') => void;
  onReportPress: () => void;
}

const ENTITY_FILTER_LABELS: Record<EntityListFilter, string> = {
  all: 'All',
  has_due: 'Has due',
  no_due: 'No due',
};

export function TreasuryToolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search entities…',
  entityFilter = 'all',
  onEntityFilterChange,
  showPeriodFilter,
  periodFilter = 'MONTH',
  onPeriodFilterChange,
  onReportPress,
}: TreasuryToolbarProps) {
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  const filterLabel =
    onEntityFilterChange != null
      ? ENTITY_FILTER_LABELS[entityFilter]
      : showPeriodFilter && onPeriodFilterChange
        ? periodFilter === 'MONTH'
          ? 'This month'
          : periodFilter
        : null;

  const showFilterDropdownOpen =
    (onEntityFilterChange != null && showFilterDropdown) ||
    (showPeriodFilter && onPeriodFilterChange && showPeriodDropdown);

  return (
    <View style={styles.wrapper}>
      <View style={styles.singleRow}>
        <View style={styles.searchWrap}>
          <FontAwesome name="search" size={12} color={Theme.textMutedDemo} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder={searchPlaceholder}
            placeholderTextColor={Theme.textMutedDemo}
            returnKeyType="search"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </View>
        <TouchableOpacity style={styles.reportBtn} onPress={onReportPress} activeOpacity={0.8}>
          <FontAwesome name="file-text-o" size={12} color={Theme.textOnDark} />
          <Text style={styles.reportLabel}>Report</Text>
        </TouchableOpacity>
        {filterLabel != null && (
          <View style={styles.filterBlock}>
            <TouchableOpacity
              style={styles.filterTrigger}
              onPress={() => {
                if (onEntityFilterChange) {
                  setShowPeriodDropdown(false);
                  setShowFilterDropdown((v) => !v);
                } else if (onPeriodFilterChange) {
                  setShowFilterDropdown(false);
                  setShowPeriodDropdown((v) => !v);
                }
              }}
              activeOpacity={0.8}
            >
              <FontAwesome name="filter" size={10} color={Theme.textMutedDemo} style={styles.filterIcon} />
              <Text style={styles.filterTriggerText} numberOfLines={1}>
                {filterLabel}
              </Text>
              <FontAwesome name="chevron-down" size={10} color={Theme.textMutedDemo} />
            </TouchableOpacity>
            {showFilterDropdownOpen && (
              <View style={styles.dropdown}>
                {onEntityFilterChange &&
                  (['all', 'has_due', 'no_due'] as const).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={styles.dropdownItem}
                      onPress={() => {
                        onEntityFilterChange(f);
                        setShowFilterDropdown(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dropdownItemText, entityFilter === f && styles.dropdownItemTextActive]}>
                        {ENTITY_FILTER_LABELS[f]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                {showPeriodFilter && onPeriodFilterChange && (
                  <>
                    {(['TODAY', 'MONTH', 'RANGE'] as const).map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={styles.dropdownItem}
                        onPress={() => {
                          onPeriodFilterChange(p);
                          setShowPeriodDropdown(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dropdownItemText, periodFilter === p && styles.dropdownItemTextActive]}>
                          {p === 'MONTH' ? 'This month' : p}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 8,
    marginBottom: 8,
    backgroundColor: Theme.darkBackground,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    padding: 12,
  },
  singleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textOnDark,
    paddingVertical: 2,
    minWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any,
    }),
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  reportLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    color: Theme.textOnDark,
    textTransform: 'uppercase',
  },
  filterBlock: {
    position: 'relative',
    minWidth: 72,
  },
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    gap: 4,
  },
  filterIcon: {
    marginRight: 2,
  },
  filterTriggerText: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textOnDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    minWidth: 120,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    borderRadius: 2,
    padding: 4,
    zIndex: 100,
    elevation: 8,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dropdownItemText: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
  },
  dropdownItemTextActive: {
    color: Theme.teslaRed,
  },
});
