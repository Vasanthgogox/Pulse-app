import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';

export type TrustIndicatorId = 'identity' | 'verification' | 'workspace' | 'compliance';

const TRUST_COPY: Record<TrustIndicatorId, string> = {
  identity: 'Identity',
  verification: 'Verification',
  workspace: 'Workspace',
  compliance: 'Compliance',
};

export interface OnboardingTrustBarProps {
  active: TrustIndicatorId;
  completed?: readonly TrustIndicatorId[];
}

export const OnboardingTrustBar = memo(function OnboardingTrustBar({
  active,
  completed = [],
}: OnboardingTrustBarProps) {
  const ids: TrustIndicatorId[] = ['identity', 'verification', 'workspace', 'compliance'];

  return (
    <View style={styles.row} accessibilityRole="summary">
      {ids.map((id) => {
        const isActive = id === active;
        const isDone = completed.includes(id);
        return (
          <View key={id} style={styles.item}>
            <View
              style={[
                styles.dot,
                isDone && styles.dotDone,
                isActive && styles.dotActive,
              ]}
            >
              {isDone ? (
                <FontAwesome name="check" size={8} color="#fff" />
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                isActive && styles.labelActive,
                isDone && styles.labelDone,
              ]}
              numberOfLines={1}
            >
              {TRUST_COPY[id]}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[2],
    paddingVertical: space[2],
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  dotActive: {
    borderColor: colors.brand,
    backgroundColor: '#ecfdf5',
  },
  dotDone: {
    borderColor: colors.revenue,
    backgroundColor: colors.revenue,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  labelActive: {
    color: colors.brand,
  },
  labelDone: {
    color: colors.textSecondary,
  },
});
