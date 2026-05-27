import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';

/** "or" divider between keypad primary path and alternates (Google, sign-in). */
export const OnboardingKeypadAltRow = memo(function OnboardingKeypadAltRow({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.orRow}>
        <View style={styles.line} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.line} />
      </View>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginBottom: space[3],
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },
  orText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
