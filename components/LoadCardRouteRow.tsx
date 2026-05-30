import Typography from '@/constants/Typography';
import Theme from '@/constants/Theme';
import { splitHubRouteLocationDisplay } from '@/features/trips/utils/tripLocationDisplay.util';
import { ChevronRight } from 'lucide-react-native';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type LoadCardRouteRowProps = {
  origin: string;
  destination: string;
  /** Merged with the root row (e.g. margin overrides). */
  style?: StyleProp<ViewStyle>;
  /** Tighter type scale for indent detail / dense grids */
  compact?: boolean;
};

function asRouteLabel(value: string): string {
  const t = (value || '—').trim();
  return t ? t.toUpperCase() : '—';
}

function RouteLeg({
  location,
  align,
  compact,
  showDestDot,
}: {
  location: string;
  align: 'left' | 'right';
  compact?: boolean;
  /** When true, render the green destination dot (right leg). */
  showDestDot?: boolean;
}) {
  const { city, state } = splitHubRouteLocationDisplay(location);
  const end = align === 'right';

  return (
    <View style={[styles.endWrap, end && styles.endWrapRight, compact && styles.endWrapCompact]}>
      <View style={[styles.legRow, end && styles.legRowEnd]}>
        {!end && !showDestDot ? (
          <View
            style={[
              styles.dot,
              styles.dotOrigin,
              compact && styles.dotCompact,
            ]}
          />
        ) : null}
        <View style={[styles.legTextBlock, end && styles.legTextBlockEnd]}>
          <Text
            style={[
              styles.legCity,
              compact && styles.legCityCompact,
              end && styles.legTextAlignEnd,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {asRouteLabel(city)}
          </Text>
          <Text
            style={[
              styles.legState,
              compact && styles.legStateCompact,
              end && styles.legTextAlignEnd,
              !state && styles.legStatePlaceholder,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {state ? asRouteLabel(state) : '\u00a0'}
          </Text>
        </View>
        {showDestDot ? (
          <View
            style={[
              styles.dot,
              styles.dotDest,
              compact && styles.dotCompact,
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Origin → destination row used on Load Center cards and indent detail.
 * City in bold large type; state in smaller muted type (`splitHubRouteLocationDisplay`).
 */
export function LoadCardRouteRow({
  origin,
  destination,
  style,
  compact,
}: LoadCardRouteRowProps) {
  return (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      <RouteLeg location={origin} align="left" compact={compact} />
      <View style={[styles.mid, compact && styles.midCompact, { pointerEvents: 'none' }]}>
        <View style={styles.midLine} />
        <ChevronRight size={14} color={Theme.textMuted} strokeWidth={2.4} />
      </View>
      <RouteLeg
        location={destination}
        align="right"
        compact={compact}
        showDestDot
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 8,
    zIndex: 1,
  },
  rowCompact: {
    minHeight: 48,
    marginBottom: 6,
    paddingTop: 2,
  },
  endWrap: {
    flex: 1,
    minWidth: 0,
  },
  endWrapRight: {
    alignItems: 'flex-end',
  },
  endWrapCompact: {},
  legRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  legRowEnd: {
    justifyContent: 'flex-end',
  },
  dotCompact: {
    marginTop: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
    marginTop: 4,
  },
  dotOrigin: {
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.75,
  },
  dotDest: {
    backgroundColor: Theme.positive,
  },
  legTextBlock: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    ...Platform.select({
      web: { width: '100%' } as ViewStyle,
      default: {},
    }),
  },
  legTextBlockEnd: {
    alignItems: 'flex-end',
  },
  legCity: {
    ...Typography.networkLoadRouteCity,
    color: Theme.textPrimaryDark,
    lineHeight: 19,
    width: '100%',
  },
  legCityCompact: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    fontStyle: 'normal',
  },
  legState: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '500',
    color: Theme.textSecondary,
    lineHeight: 13,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    width: '100%',
  },
  legStateCompact: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '500',
  },
  legStatePlaceholder: {
    opacity: 0,
  },
  legTextAlignEnd: {
    textAlign: 'right',
  },
  mid: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 0,
    marginTop: 6,
  },
  midLine: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.borderMedium,
    marginRight: -2,
  },
  midCompact: {
    marginTop: 8,
  },
});
