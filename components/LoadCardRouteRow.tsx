import Theme from '@/constants/Theme';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type LoadCardRouteRowProps = {
  origin: string;
  destination: string;
  /** Merged with the root row (e.g. margin overrides). */
  style?: StyleProp<ViewStyle>;
  /** Capped lines + stable min height for multi-column grids */
  compact?: boolean;
};

/**
 * Origin → destination row used on Load Center cards and indent detail
 * so route layout stays consistent (two legs + connector, not a single wrapped sentence).
 */
export function LoadCardRouteRow({ origin, destination, style, compact }: LoadCardRouteRowProps) {
  const o = (origin || '—').trim().toUpperCase();
  const d = (destination || '—').trim().toUpperCase();
  const lines = compact ? 2 : 3;
  return (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      <View style={[styles.endWrap, compact && styles.endWrapCompact]}>
        <View style={[styles.dot, styles.dotOrigin, compact && styles.dotCompact]} />
        <Text
          style={[styles.legText, compact && styles.legTextCompact, styles.legTextLeft]}
          numberOfLines={lines}
        >
          {o}
        </Text>
      </View>
      <View style={[styles.mid, compact && styles.midCompact, { pointerEvents: 'none' }]}>
        <View style={styles.midLine} />
        <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2.4} />
      </View>
      <View style={[styles.endWrap, styles.endWrapRight, compact && styles.endWrapCompact]}>
        <Text
          style={[styles.legText, compact && styles.legTextCompact, styles.legTextRight]}
          numberOfLines={lines}
        >
          {d}
        </Text>
        <View style={[styles.dot, styles.dotDest, compact && styles.dotCompact]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
    zIndex: 1,
  },
  rowCompact: {
    minHeight: 48,
    marginBottom: 6,
    alignItems: 'flex-start',
    paddingTop: 2,
  },
  endWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  endWrapRight: {
    justifyContent: 'flex-end',
  },
  endWrapCompact: {
    alignItems: 'flex-start',
  },
  dotCompact: {
    marginTop: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  dotOrigin: {
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.75,
  },
  dotDest: {
    backgroundColor: Theme.positive,
  },
  legText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    lineHeight: 19,
    letterSpacing: -0.25,
  },
  legTextLeft: {
    textAlign: 'left',
  },
  legTextRight: {
    textAlign: 'right',
  },
  legTextCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  mid: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 0,
  },
  midLine: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.borderMedium,
    marginRight: -2,
  },
  midCompact: {
    marginTop: 5,
  },
});
