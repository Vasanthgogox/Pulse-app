/**
 * Trip detail — Aggregate trip: show Associated Partner, Partner Rate, Advance Paid, Balance Payable.
 * Shown in Tracking tab when trip.supplier_id is set (Source of Supply = Aggregate).
 */
import { View, Text, StyleSheet } from 'react-native';
import Theme from '@/constants/Theme';
import type { TripRow } from '../services/trips.service';

export interface TripPartnerCardProps {
  trip: TripRow;
  /** Resolved partner/supplier display name */
  partnerName: string;
  /** Advance paid (e.g. from ledger); when not available show "—" */
  advancePaid?: number | null;
}

/** Balance Payable = Partner Rate − Advance Paid */
function balancePayable(partnerRate: number, advancePaid: number | null | undefined): number | null {
  if (advancePaid == null || advancePaid === 0) return null;
  return Math.max(0, partnerRate - advancePaid);
}

export function TripPartnerCard({ trip, partnerName, advancePaid }: TripPartnerCardProps) {
  const rate = trip.supplier_rate ?? 0;
  const advance = advancePaid ?? 0;
  const balance = balancePayable(rate, advancePaid);

  return (
    <View style={[styles.wrapper, styles.wrapperStretch]}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>TRACKING & RESOURCE — PARTNER</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Associated Partner</Text>
          <Text style={styles.value} numberOfLines={1}>{partnerName || '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Partner rate (₹)</Text>
          <Text style={styles.value}>₹{rate.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Advance paid (₹)</Text>
          <Text style={styles.value}>
            {advancePaid != null && advancePaid > 0 ? `₹${advance.toLocaleString('en-IN')}` : '—'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Balance payable (₹)</Text>
          <Text style={styles.value}>
            {balance != null ? `₹${balance.toLocaleString('en-IN')}` : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  label: {
    fontSize: 8,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    marginTop: 0,
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    marginLeft: 12,
  },
  wrapperStretch: { alignSelf: 'stretch' as const },
});
