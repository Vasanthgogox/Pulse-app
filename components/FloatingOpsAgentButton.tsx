/**
 * Global floating Ops Agent button — visible on home list screens.
 * Tapping opens the dedicated Ops Agent route.
 */
import { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OpsAgentBotSvg } from '@/features/ops-agent/components/OpsAgentBotSvg';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';

const FAB_SIZE = 46;
const BOT_ICON_SIZE = 22;
const CHAT_STACK_OFFSET = FAB_SIZE + 14;

/** Show floating Ops Agent only on home (tab list) pages, not on Ops Agent or detail pages. */
function useShowFloatingOpsAgent(): boolean {
  const pathname = usePathname();
  if (!pathname || typeof pathname !== 'string') return false;
  const p = pathname as string;
  // Only show on the three main tab list screens (home pages)
  if (p === '/(tabs)/finance') return true;
  if (p === '/(tabs)/trips') return true;
  if (p === '/(tabs)/network') return true;
  return false;
}

export function FloatingOpsAgentButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const show = useShowFloatingOpsAgent();

  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!show) return;
    // Keep a subtle idle feel without large perceived size changes.
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
  }, [show, pulse]);

  const animatedCircleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  if (!show) return null;

  const bottom =
    Layout.demoTabBarScrollBottomInset +
    insets.bottom +
    Layout.tabBarBottomPaddingMin +
    CHAT_STACK_OFFSET;

  return (
    <View
      style={[styles.wrap, { bottom }, { pointerEvents: 'box-none' }]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push('/(tabs)/ops-agent')}
        style={styles.touchable}
        accessibilityLabel="Open Ops Agent"
      >
        <Animated.View style={[styles.circle, animatedCircleStyle]}>
          <View style={styles.iconWrap}>
            <OpsAgentBotSvg
              width={BOT_ICON_SIZE}
              height={(39 / 32) * BOT_ICON_SIZE}
              headOnly
              bright
            />
          </View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    zIndex: 999,
  },
  touchable: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: "#1e40af",
    borderWidth: 1.5,
    borderColor: Theme.borderOnDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#1e40af",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
