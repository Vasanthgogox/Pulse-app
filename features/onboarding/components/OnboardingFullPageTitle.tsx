import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';

export interface OnboardingFullPageTitleProps {
  title: string;
  subtitle?: string | ReactNode;
  eyebrow?: string;
}

/** Large in-page headline — shell stays minimal so this owns readability. */
export const OnboardingFullPageTitle = memo(function OnboardingFullPageTitle({
  title,
  subtitle,
  eyebrow,
}: OnboardingFullPageTitleProps) {
  return (
    <View style={styles.wrap}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? (
        typeof subtitle === 'string' ? (
          <Text style={styles.subtitle}>{subtitle}</Text>
        ) : (
          <View style={styles.subNode}>{subtitle}</View>
        )
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: space[5],
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
    marginBottom: space[2],
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 32,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginTop: space[2],
  },
  subNode: {
    marginTop: space[2],
  },
});
