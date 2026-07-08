import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import Theme from '@/constants/Theme';
import { PulseActivationMarketingPanel } from '@/features/auth/signup/components/PulseActivationMarketingPanel';
import { suiteSignInCopy } from '@/lib/suite/suiteAuthContent';
import type { SuiteProductId } from '@/lib/suite/suiteProducts';
import { resolveSuiteProduct } from '@/lib/suite/suiteProducts';

export type SignInBrandPanelProps = {
  productId?: SuiteProductId | null;
};

/** Desktop sign-in left rail — product-aware marketing panel. */
export const SignInBrandPanel = memo(function SignInBrandPanel({
  productId = null,
}: SignInBrandPanelProps) {
  const product = resolveSuiteProduct(productId);
  const copy = suiteSignInCopy(productId);

  return (
    <View style={styles.leftCol}>
      <PulseActivationMarketingPanel
        brandWord={product.brandWord}
        tag={copy.brandLabel}
        title={copy.heroHeadline}
        outcomeLines={copy.principles}
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
