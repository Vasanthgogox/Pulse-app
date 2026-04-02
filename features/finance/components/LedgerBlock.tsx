/**
 * Ledger UI: TELEMETRY HISTORY list and EXPORT LEDGER button.
 * Uses Theme (borderLight, textMutedDemo, positive, teslaRed).
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';

export interface LedgerEntry {
  id: string;
  desc: string;
  date: string;
  /** Credit (in) = show in green; debit (out) = show in black */
  amount: number;
  isCredit: boolean;
}

interface LedgerBlockProps {
  /** @deprecated No longer displayed; kept for API compatibility */
  totalVol?: number;
  /** @deprecated No longer displayed; kept for API compatibility */
  balanceDue?: number;
  entries: LedgerEntry[];
  onExportLedger?: () => void;
  /** When set (e.g. supplier), show PAID row above TELEMETRY HISTORY */
  paid?: number;
}

function formatAmount(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

export function LedgerBlock({ entries, onExportLedger, paid }: LedgerBlockProps) {
  return (
    <View style={styles.wrapper}>
      {paid != null && (
        <View style={styles.paidRow}>
          <Text style={styles.paidLabel}>PAID</Text>
          <Text style={styles.paidValue}>{formatAmount(paid)}</Text>
        </View>
      )}

      <Text style={[styles.telemetryTitle, paid != null && { marginTop: 8 }]}>TELEMETRY HISTORY</Text>
      <View style={styles.telemetryList}>
        {entries.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>No entries</Text>
          </View>
        ) : (
          entries.map((tx) => (
            <View key={tx.id} style={styles.telemetryRow}>
              <View style={styles.telemetryLeft}>
                <Text style={styles.telemetryDesc} numberOfLines={1}>{tx.desc}</Text>
                <Text style={styles.telemetryDate}>{tx.date}</Text>
              </View>
              <Text style={[styles.telemetryAmount, tx.isCredit ? styles.amountCredit : styles.amountDebit]}>
                {formatAmount(tx.amount)}
              </Text>
            </View>
          ))
        )}
      </View>

      {onExportLedger != null && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.exportBtn} onPress={onExportLedger} activeOpacity={0.8}>
            <Text style={styles.exportBtnText}>EXPORT LEDGER</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Theme.surfaceForm,
    paddingVertical: Layout.sectionSpacing,
    paddingHorizontal: 0,
    marginBottom: Layout.sectionSpacing,
  },
  paidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 0,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  paidLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  paidValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  telemetryTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 0,
  },
  telemetryList: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceLight,
  },
  telemetryLeft: {
    flex: 1,
    minWidth: 0,
  },
  telemetryDesc: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  telemetryDate: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    marginTop: 4,
  },
  telemetryAmount: {
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 12,
  },
  amountCredit: {
    color: Theme.darkGreen,
  },
  amountDebit: {
    color: Theme.textPrimaryDark,
  },
  emptyRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
  },
  footer: {
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  exportBtn: {
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  exportBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
