/**
 * Hammer hit animation — green gavel that loops when bids/offers are present.
 * Used in IndentDetailScreen (Live Bids) and LoadCenterView (Hire Partner cards).
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import Theme from '@/constants/Theme';

export interface BidReceivedHammerProps {
  visible: boolean;
  /** Icon size (default 14). */
  size?: number;
}

export function BidReceivedHammer({ visible, size = 14 }: BidReceivedHammerProps) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const hit = () =>
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]);
    const loop = Animated.loop(
      Animated.sequence([hit(), Animated.delay(1000)]),
      { iterations: -1 }
    );
    loop.start();
    return () => loop.stop();
  }, [visible, rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-25deg', '18deg'],
  });

  if (!visible) return null;
  const slot = size + 4;
  return (
    <View style={[styles.slot, { width: slot, height: slot }]}>
      <Animated.View style={[styles.wrap, { transform: [{ rotate }] }]}>
        <FontAwesome name="gavel" size={size} color={Theme.positive} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
