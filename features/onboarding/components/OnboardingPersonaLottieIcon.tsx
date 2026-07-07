import LottieView from 'lottie-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { OnboardingLottieAsset } from './onboardingPersonaAssets';

export type OnboardingPersonaLottieIconProps = {
  asset: OnboardingLottieAsset;
  size?: number;
  active?: boolean;
};

export const OnboardingPersonaLottieIcon = memo(function OnboardingPersonaLottieIcon({
  asset,
  size = 40,
  active = false,
}: OnboardingPersonaLottieIconProps) {
  const glyphScale = asset.glyphScale ?? 1.1;
  const dim = Math.round(size * glyphScale);

  return (
    <View style={[styles.slot, { width: size, height: size }]}>
      <LottieView
        source={asset.source}
        autoPlay
        loop
        speed={active ? (asset.speed ?? 1) * 1.1 : (asset.speed ?? 1)}
        resizeMode="contain"
        style={{ width: dim, height: dim }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
