/**
 * Treasury summary banner — dark block with Total In / Total Out and period filter.
 * Single source: parent passes totals (from one ledger fetch or tab callbacks). Theme only.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import type { FinancePeriodFilter } from '../types';

export type { FinancePeriodFilter };

export interface TreasurySummaryBannerProps {
  totalIn: number;
  totalOut: number;
  labelIn: string;
  labelOut: string;
  periodFilter: FinancePeriodFilter;
  onPeriodChange: (period: FinancePeriodFilter) => void;
  /** When false, period pills are hidden (e.g. for non-ledger tabs). */
  showPeriodFilter?: boolean;
}

function formatAmount(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

export function TreasurySummaryBanner({
  totalIn,
  totalOut,
  labelIn,
  labelOut,
  periodFilter: _periodFilter,
  onPeriodChange: _onPeriodChange,
  showPeriodFilter: _showPeriodFilter = true,
}: TreasurySummaryBannerProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={styles.cell}>
          <View style={styles.labelRow}>
            <FontAwesome name="arrow-circle-up" size={14} color={Theme.darkGreen} />
            <Text style={styles.label}>{labelIn}</Text>
          </View>
          <Text style={styles.value}>{formatAmount(totalIn)}</Text>
        </View>
        <View style={[styles.cell, styles.cellRight]}>
          <View style={styles.labelRowRight}>
            <Text style={styles.label}>{labelOut}</Text>
            <FontAwesome name="arrow-circle-down" size={14} color={Theme.teslaRed} />
          </View>
          <Text style={styles.value}>{formatAmount(totalOut)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Theme.darkBackground,
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  cell: {
    flex: 1,
    padding: 20,
    borderRightWidth: 1,
    borderRightColor: Theme.separatorDark,
  },
  cellRight: {
    borderRightWidth: 0,
    alignItems: 'flex-end',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  labelRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textSecondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.textOnDark,
    letterSpacing: -0.5,
  },
  pills: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    paddingHorizontal: 16,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  pillActive: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.screenBackground,
  },
  pillText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Theme.textSecondary,
  },
  pillTextActive: { color: Theme.textPrimaryDark },
});
