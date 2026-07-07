import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import Theme from '@/constants/Theme';
import { PulseActivationMarketingPanel } from '@/features/auth/signup/components/PulseActivationMarketingPanel';
import { SIGN_IN_COPY } from '@/lib/auth/signInContent';

/** Desktop sign-in left rail — matches create-account marketing panel. */
export const SignInBrandPanel = memo(function SignInBrandPanel() {
  return (
    <View style={styles.leftCol}>
      <PulseActivationMarketingPanel
        tag={SIGN_IN_COPY.brandLabel}
        title={SIGN_IN_COPY.heroHeadline}
        outcomeLines={SIGN_IN_COPY.principles}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  leftCol: {
    flex: 1,
    minWidth: 0,
    maxWidth: '50%',
    backgroundColor: Theme.screenBackground,
    minHeight: 0,
    overflow: 'hidden',
  },
});
