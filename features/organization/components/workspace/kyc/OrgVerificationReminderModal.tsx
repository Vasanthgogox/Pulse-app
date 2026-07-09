import Theme from '@/constants/Theme';
import type { OrgVerificationReminderCopy } from '@/features/organization/components/workspace/kyc/orgVerificationReminder.util';
import { platformShadow } from '@/lib/platformShadow';
import { ArrowRight, X } from 'lucide-react-native';
import LottieView from 'lottie-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const WEB_DESKTOP_BREAKPOINT = 600;
const DISMISS_DRAG_PX = 72;
const DISMISS_VELOCITY = 0.65;

const VERIFICATION_LOTTIE = {
  overdue: require('@/assets/Animated folder/security.json'),
  calm: require('@/assets/Animated folder/conversation-verified.json'),
} as const;

type Props = {
  visible: boolean;
  copy: OrgVerificationReminderCopy;
  onVerify: () => void;
  onLater: () => void;
};

function VerificationLottieIcon({
  overdue,
  chipBg,
  chipBorder,
}: {
  overdue: boolean;
  chipBg: string;
  chipBorder: string;
}) {
  const slot = 64;
  const glyph = Math.round(slot * 1.28);

  return (
    <View style={[styles.lottieChip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
      <LottieView
        source={overdue ? VERIFICATION_LOTTIE.overdue : VERIFICATION_LOTTIE.calm}
        autoPlay
        loop
        speed={overdue ? 1.05 : 0.9}
        resizeMode="contain"
        style={{ width: glyph, height: glyph }}
      />
    </View>
  );
}

function AnimatedCtaArrow({ color }: { color: string }) {
  const shift = useSharedValue(0);

  useEffect(() => {
    shift.value = withRepeat(
      withSequence(
        withTiming(3, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        withDelay(500, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [shift]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shift.value }],
  }));

  return (
    <Reanimated.View style={arrowStyle}>
      <ArrowRight size={14} color={color} strokeWidth={2.5} />
    </Reanimated.View>
  );
}

export function OrgVerificationReminderModal({ visible, copy, onVerify, onLater }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && screenWidth >= WEB_DESKTOP_BREAKPOINT;
  const dragY = useRef(new Animated.Value(0)).current;
  const dismissingRef = useRef(false);
  const [shellVisible, setShellVisible] = useState(visible);
  const [isDragging, setIsDragging] = useState(false);

  const backdropOpacity = useSharedValue(0);
  const sheetOpacity = useSharedValue(0);
  const sheetScale = useSharedValue(0.96);
  const sheetLift = useSharedValue(isWebDesktop ? 12 : 32);

  const playEntrance = useCallback(() => {
    backdropOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    sheetOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
    sheetScale.value = withSpring(1, { damping: 18, stiffness: 260, mass: 0.85 });
    sheetLift.value = withSpring(0, { damping: 18, stiffness: 260, mass: 0.85 });
  }, [backdropOpacity, sheetLift, sheetOpacity, sheetScale]);

  const playExit = useCallback(
    (onDone: () => void) => {
      backdropOpacity.value = withTiming(0, { duration: 160 });
      sheetOpacity.value = withTiming(0, { duration: 160 });
      sheetScale.value = withTiming(0.97, { duration: 160 });
      sheetLift.value = withTiming(isWebDesktop ? 8 : 20, { duration: 160 }, (finished) => {
        if (finished) onDone();
      });
    },
    [backdropOpacity, isWebDesktop, sheetLift, sheetOpacity, sheetScale],
  );

  useEffect(() => {
    if (visible) {
      dismissingRef.current = false;
      setShellVisible(true);
      dragY.setValue(0);
      setIsDragging(false);
      playEntrance();
      return;
    }
    if (!dismissingRef.current && shellVisible) {
      playExit(() => {
        setShellVisible(false);
        dragY.setValue(0);
        setIsDragging(false);
      });
    }
  }, [visible, dragY, playEntrance, playExit, shellVisible]);

  const resetDrag = useCallback(() => {
    Animated.spring(dragY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 9,
      tension: 120,
    }).start();
    setIsDragging(false);
  }, [dragY]);

  const requestDismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    if (!isWebDesktop) {
      Animated.timing(dragY, {
        toValue: 480,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        dragY.setValue(0);
        setIsDragging(false);
        playExit(() => {
          dismissingRef.current = false;
          setShellVisible(false);
          onLater();
        });
      });
      return;
    }
    playExit(() => {
      dismissingRef.current = false;
      setShellVisible(false);
      onLater();
    });
  }, [dragY, isWebDesktop, onLater, playExit]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderGrant: () => setIsDragging(true),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) dragY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy >= DISMISS_DRAG_PX || gesture.vy >= DISMISS_VELOCITY) {
            requestDismiss();
            return;
          }
          resetDrag();
        },
        onPanResponderTerminate: resetDrag,
      }),
    [dragY, requestDismiss, resetDrag],
  );

  const sheetTranslate = dragY.interpolate({
    inputRange: [0, 480],
    outputRange: [0, 480],
    extrapolate: 'clamp',
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetEnterStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
    transform: [{ translateY: sheetLift.value }, { scale: sheetScale.value }],
  }));

  if (!shellVisible && !visible) return null;

  return (
    <Modal
      visible={shellVisible}
      transparent
      animationType="none"
      onRequestClose={requestDismiss}
      statusBarTranslucent
    >
      <View
        style={[
          styles.backdropHost,
          isWebDesktop ? styles.backdropWebDesktop : Platform.OS === 'web' ? styles.backdropWebMobile : null,
        ]}
      >
        <Reanimated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={styles.backdropTouch}
            onPress={requestDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss verification reminder"
          />
        </Reanimated.View>

        <Reanimated.View
          style={[sheetEnterStyle, isWebDesktop ? styles.sheetDesktopWrap : styles.sheetMobileWrap]}
        >
          <Animated.View
            style={[
              styles.sheet,
              isWebDesktop ? styles.sheetWebDesktop : styles.sheetMobile,
              !isWebDesktop && { transform: [{ translateY: sheetTranslate }] },
              isDragging && styles.sheetDragging,
              !isWebDesktop && { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            {!isWebDesktop ? (
              <View
                style={styles.sheetDragCapture}
                {...panResponder.panHandlers}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <View style={styles.dragHandle} />
              </View>
            ) : null}

            <View style={[styles.hero, { backgroundColor: copy.tone.bg }]}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroEyebrowRow}>
                  <View style={[styles.heroEyebrowDot, { backgroundColor: copy.tone.fg }]} />
                  <Text style={[styles.heroEyebrow, { color: copy.tone.fg }]}>{copy.eyebrow}</Text>
                </View>
                <Pressable
                  onPress={requestDismiss}
                  style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={14} color={Theme.textMuted} strokeWidth={2.5} />
                </Pressable>
              </View>
            </View>

            <View style={styles.heroBody}>
              <VerificationLottieIcon
                overdue={copy.overdue}
                chipBg={Theme.cardWhite}
                chipBorder={copy.tone.border}
              />
              <Text style={styles.heroTitle}>{copy.title}</Text>
              <Text style={styles.heroSub}>{copy.sub}</Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: copy.tone.fg }]}
                onPress={onVerify}
                activeOpacity={0.9}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Verify now</Text>
                <AnimatedCtaArrow color={Theme.textOnPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={requestDismiss}
                activeOpacity={0.88}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryBtnText}>Remind me later</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Reanimated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropHost: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.76)',
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      web: { cursor: 'pointer' as const },
      default: {},
    }),
  },
  backdropWebDesktop: {
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99990,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdropWebMobile: {
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99990,
    justifyContent: 'flex-end',
  },
  sheetDesktopWrap: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  sheetMobileWrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
  sheet: {
    overflow: 'hidden',
    backgroundColor: Theme.cardWhite,
    flexDirection: 'column',
    position: 'relative',
    borderWidth: 1,
    borderColor: Theme.borderLight,
    ...platformShadow('0 20px 56px rgba(15, 23, 42, 0.18)', {
      color: '#0f172a',
      opacity: 0.14,
      radius: 20,
      offsetY: 12,
      elevation: 18,
    }),
  },
  sheetWebDesktop: {
    borderRadius: 22,
    width: '100%',
  },
  sheetMobile: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    alignSelf: 'stretch',
  },
  sheetDragging: {
    opacity: 0.98,
  },
  sheetDragCapture: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 2,
    backgroundColor: Theme.cardWhite,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
  },
  hero: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroEyebrowDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  heroEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  closeBtnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  heroBody: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 14,
    backgroundColor: Theme.cardWhite,
  },
  lottieChip: {
    width: 68,
    height: 68,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
    letterSpacing: -0.25,
  },
  heroSub: {
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  actions: {
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 16,
    gap: 8,
    backgroundColor: Theme.cardWhite,
  },
  primaryBtn: {
    minHeight: 42,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  secondaryBtn: {
    minHeight: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
});
