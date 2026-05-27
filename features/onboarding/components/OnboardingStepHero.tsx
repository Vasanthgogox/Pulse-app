import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';

import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';
import type { DensityTier } from '@/components/operational';

export interface OnboardingStepHeroProps {
  title: string;
  subtitle?: string | ReactNode;
  eyebrow?: string;
  align?: 'left' | 'center';
  density?: DensityTier;
}

export const OnboardingStepHero = memo(function OnboardingStepHero({
  title,
  subtitle,
  eyebrow,
  align = 'center',
  density = 'medium',
}: OnboardingStepHeroProps) {
  const centered = align === 'center';

  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 240 }}
      style={[styles.wrap, centered && styles.centered]}
    >
      {eyebrow ? (
        <Text style={[styles.eyebrow, centered && styles.textCenter]}>{eyebrow}</Text>
      ) : null}
      <Text
        style={[
          density === 'high' ? typography.title : typography.heading,
          centered && styles.textCenter,
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        typeof subtitle === 'string' ? (
          <Text style={[styles.sub, centered && styles.textCenter]}>{subtitle}</Text>
        ) : (
          <View style={styles.subNode}>{subtitle}</View>
        )
      ) : null}
    </MotiView>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: space[5],
  },
  centered: {
    alignItems: 'center',
  },
  eyebrow: {
    ...typography.label,
    marginBottom: space[2],
    color: colors.brand,
  },
  textCenter: {
    textAlign: 'center',
  },
  sub: {
    ...typography.caption,
    marginTop: space[2],
    maxWidth: 320,
    lineHeight: 20,
  },
  subNode: {
    marginTop: space[2],
    maxWidth: 360,
  },
});
