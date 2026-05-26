import Theme from '@/constants/Theme';
import { MAP_LOCATION_LABEL_LOADING } from '@/lib/mapLocationLabel.service';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

export type ManifestDriverPing = {
  recorded_at: string;
  locationName: string | null;
};

type Props = {
  pings: ManifestDriverPing[];
};

function formatPingTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export function ManifestDriverPingList({ pings }: Props) {
  if (pings.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Feather name="radio" size={12} color={Theme.primary} />
        <Text style={styles.headerTitle}>Driver GPS pings</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pings.length}</Text>
        </View>
      </View>
      {pings.map((ping, idx) => (
        <View
          key={`${ping.recorded_at}-${idx}`}
          style={[styles.row, idx < pings.length - 1 && styles.rowBorder]}
        >
          <View style={styles.dotCol}>
            <View style={styles.dot} />
            {idx < pings.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <View style={styles.body}>
            <Text style={styles.time}>{formatPingTime(ping.recorded_at)}</Text>
            <Text style={styles.place} numberOfLines={2}>
              {ping.locationName?.trim() || MAP_LOCATION_LABEL_LOADING}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    gap: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Theme.textSecondary,
    flex: 1,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(79,70,229,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.primary,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    minHeight: 44,
  },
  rowBorder: {},
  dotCol: {
    width: 14,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fb923c',
    borderWidth: 1.5,
    borderColor: '#c2410c',
    marginTop: 4,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: Theme.borderLight,
    marginTop: 4,
    minHeight: 20,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  time: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  place: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
});
