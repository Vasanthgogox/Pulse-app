/**
 * Hammer hit animation — green gavel that loops when bids/offers are present.
 * Used in IndentDetailScreen (Live Bids) and LoadCenterView (Hire Partner cards).
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
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
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
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
  return (
    <Animated.View style={[styles.wrap, { transform: [{ rotate }] }]}>
      <FontAwesome name="gavel" size={size} color={Theme.positive} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
});
