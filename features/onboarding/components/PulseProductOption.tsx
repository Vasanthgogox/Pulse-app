import { memo } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import Theme from '@/constants/Theme';
import type { PulseProduct } from '@/lib/onboarding/productCatalog';

import { ONBOARDING_BRAND, PULSE_PRODUCT_VISUALS } from './onboardingPersonaAssets';
import { OnboardingPersonaLottieIcon } from './OnboardingPersonaLottieIcon';

export interface PulseProductOptionProps {
  product: PulseProduct;
  onPress: () => void;
  compact?: boolean;
}

export const PulseProductOption = memo(function PulseProductOption({
  product,
  onPress,
  compact = false,
}: PulseProductOptionProps) {
  const visual = PULSE_PRODUCT_VISUALS[product.id];
  const iconSize = compact ? 28 : 38;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.card,
        compact && styles.cardCompact,
        (pressed || (Platform.OS === 'web' && hovered)) && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={product.name}
    >
      <View style={[styles.iconWrap, { width: iconSize, height: iconSize }]}>
        {visual.type === 'lottie' ? (
          <OnboardingPersonaLottieIcon asset={visual.asset} size={iconSize} />
        ) : (
          <Image
            source={visual.source}
            style={{ width: iconSize, height: iconSize }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        )}
      </View>
      <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={2}>
        {product.name}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(77, 54, 54, 0.1)',
    ...Platform.select({
      web: {
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
      } as object,
      default: {},
    }),
  },
  cardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 5,
  },
  cardPressed: {
    borderColor: 'rgba(77, 54, 54, 0.22)',
    backgroundColor: Theme.analyticsCanvas,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: ONBOARDING_BRAND.ink,
    textAlign: 'center',
  },
  nameCompact: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
});
