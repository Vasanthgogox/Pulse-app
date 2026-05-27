import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';

export interface OnboardingProgressRailProps {
  stepLabels: readonly string[];
  currentIndex: number;
  /** Optional checkpoint states aligned to steps */
  checkpointStates?: readonly ('pending' | 'active' | 'done' | 'blocked')[];
}

export const OnboardingProgressRail = memo(function OnboardingProgressRail({
  stepLabels,
  currentIndex,
  checkpointStates,
}: OnboardingProgressRailProps) {
  return (
    <View style={styles.rail} accessibilityRole="tablist">
      {stepLabels.map((label, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const state = checkpointStates?.[i];
        const blocked = state === 'blocked';

        return (
          <View
            key={`${label}-${i}`}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <View
              style={[
                styles.tick,
                done && styles.tickDone,
                active && styles.tickActive,
                blocked && styles.tickBlocked,
              ]}
            />
            <Text
              style={[
                styles.label,
                active && styles.labelActive,
                done && styles.labelDone,
                blocked && styles.labelBlocked,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: space[1],
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
    paddingHorizontal: 1,
  },
  tick: {
    width: 6,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
  },
  tickActive: {
    width: 22,
    backgroundColor: colors.brand,
  },
  tickDone: {
    width: 10,
    backgroundColor: colors.brand,
    opacity: 0.5,
  },
  tickBlocked: {
    backgroundColor: colors.pending,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.15,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.brand,
    fontWeight: '700',
  },
  labelDone: {
    color: colors.textSecondary,
  },
  labelBlocked: {
    color: colors.pending,
  },
});
