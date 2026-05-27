import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';

export interface OnboardingKeypadLink {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/** Compact text actions for keypad steps — saves viewport vs full buttons. */
export const OnboardingKeypadLinkRow = memo(function OnboardingKeypadLinkRow({
  links,
}: {
  links: readonly OnboardingKeypadLink[];
}) {
  const active = links.filter((l) => l.label);

  return (
    <View style={styles.row}>
      {active.map((link, i) => (
        <View key={link.label} style={styles.item}>
          {i > 0 ? <Text style={styles.sep}>·</Text> : null}
          <Pressable
            onPress={() => {
              if (!link.disabled) link.onPress();
            }}
            disabled={link.disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={link.label}
          >
            <Text style={[styles.link, link.disabled && styles.linkDisabled]}>
              {link.label}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space[1],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sep: {
    fontSize: 14,
    color: colors.textMuted,
    marginHorizontal: space[2],
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand,
    paddingVertical: space[1],
  },
  linkDisabled: {
    color: colors.textMuted,
  },
});
