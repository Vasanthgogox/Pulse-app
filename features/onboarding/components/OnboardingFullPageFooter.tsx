import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { layout } from '@/design-system/layout';
import { space } from '@/design-system/spacing';
import { colors } from '@/design-system/colors';
import { onboardingLayout } from '../styles/onboardingLayout';

export interface OnboardingFullPageFooterProps {
  children: ReactNode;
  /** Links row above primary button (Google, sign-in, etc.) */
  accessory?: ReactNode;
}

/** Sticky action zone — full width, aligned to activation column. */
export const OnboardingFullPageFooter = memo(function OnboardingFullPageFooter({
  children,
  accessory,
}: OnboardingFullPageFooterProps) {
  return (
    <View style={styles.wrap}>
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      <View style={styles.actions}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.canvas,
    paddingTop: space[3],
    paddingBottom: space[3],
    paddingHorizontal: layout.screenPaddingX,
    maxWidth: onboardingLayout.activationMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },
  accessory: {
    marginBottom: space[3],
    width: '100%',
  },
  actions: {
    width: '100%',
    gap: space[2],
  },
});
