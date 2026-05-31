import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Check } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { AwardedIndentDeployModalPage } from "@/features/indents/components/AwardedIndentDeployModalPage";
import { deployModalStyles as styles } from "@/features/indents/components/AwardedIndentDeployModal.styles";
import type { PendingAwardedDeployItem } from "@/features/indents/utils/pendingAwardedDeploy.util";

export type AwardedIndentDeployModalProps = {
  visible: boolean;
  items: PendingAwardedDeployItem[];
  pageIndex: number;
  onPageChange: (index: number) => void;
  onAssign: () => void;
  onLater: () => void;
  /** Collapse to bottom peek — trip stays in queue (unlike Later). */
  onMinimize: () => void;
  onViewLoad?: () => void;
};

const FINANCE_SCORECARD_GRADIENT = [
  Theme.financeCardSlateFrom,
  Theme.financeCardSlateTo,
] as const;

const MINIMIZE_DRAG_PX = 72;
const MINIMIZE_VELOCITY = 0.65;

function clampPageIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export const AwardedIndentDeployModal = memo(function AwardedIndentDeployModal({
  visible,
  items,
  pageIndex,
  onPageChange,
  onAssign,
  onLater,
  onMinimize,
  onViewLoad,
}: AwardedIndentDeployModalProps) {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const isScrollingRef = useRef(false);
  const dragY = useRef(new Animated.Value(0)).current;
  const [isDragging, setIsDragging] = useState(false);

  const safeIndex = clampPageIndex(pageIndex, items.length);
  const pageTotal = items.length;
  const showPager = pageTotal > 1 && pageWidth > 0;

  const resetDrag = useCallback(() => {
    Animated.spring(dragY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 9,
      tension: 120,
    }).start();
    setIsDragging(false);
  }, [dragY]);

  const finishMinimize = useCallback(() => {
    Animated.timing(dragY, {
      toValue: 420,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        dragY.setValue(0);
        setIsDragging(false);
        onMinimize();
      }
    });
  }, [dragY, onMinimize]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderGrant: () => setIsDragging(true),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) {
            dragY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (
            gesture.dy >= MINIMIZE_DRAG_PX ||
            gesture.vy >= MINIMIZE_VELOCITY
          ) {
            finishMinimize();
            return;
          }
          resetDrag();
        },
        onPanResponderTerminate: resetDrag,
      }),
    [dragY, finishMinimize, resetDrag],
  );

  const syncScrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      if (pageWidth <= 0) return;
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated });
    },
    [pageWidth],
  );

  useEffect(() => {
    if (!visible || !showPager) return;
    syncScrollToIndex(safeIndex, false);
  }, [visible, showPager, safeIndex, syncScrollToIndex]);

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      setIsDragging(false);
    }
  }, [visible, dragY]);

  const handlePagerLayout = useCallback((width: number) => {
    if (width > 0) setPageWidth(width);
  }, []);

  const reportPageFromOffset = useCallback(
    (offsetX: number) => {
      if (pageWidth <= 0) return;
      const next = clampPageIndex(Math.round(offsetX / pageWidth), pageTotal);
      if (next !== safeIndex) onPageChange(next);
    },
    [onPageChange, pageTotal, pageWidth, safeIndex],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!showPager || pageWidth <= 0) return;
      const offsetX = event.nativeEvent.contentOffset.x;
      const next = clampPageIndex(Math.round(offsetX / pageWidth), pageTotal);
      if (next !== safeIndex && !isScrollingRef.current) {
        onPageChange(next);
      }
    },
    [onPageChange, pageTotal, pageWidth, safeIndex, showPager],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isScrollingRef.current = false;
      reportPageFromOffset(event.nativeEvent.contentOffset.x);
    },
    [reportPageFromOffset],
  );

  const handleScrollBeginDrag = useCallback(() => {
    isScrollingRef.current = true;
  }, []);

  if (!visible || items.length === 0) return null;

  const pagerContent = items.map((item, index) => (
    <View key={item.indent.id} style={{ width: pageWidth || "100%" }}>
      <AwardedIndentDeployModalPage
        item={item}
        pageNumber={index + 1}
        pageTotal={pageTotal}
        enabled={visible && index === safeIndex}
      />
    </View>
  ));

  const sheetTranslate = dragY.interpolate({
    inputRange: [0, 400],
    outputRange: [0, 400],
    extrapolate: "clamp",
  });

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onMinimize}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, Platform.OS === "web" ? styles.backdropWeb : null]}>
        <Pressable
          style={styles.backdropTap}
          onPress={onMinimize}
          accessibilityRole="button"
          accessibilityLabel="Minimize deploy card"
        />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) + 4 },
            { transform: [{ translateY: sheetTranslate }] },
            isDragging && styles.sheetDragging,
          ]}
        >
          <View
            style={styles.sheetDragCapture}
            {...panResponder.panHandlers}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          <View
            style={styles.pagerMeasure}
            onLayout={(event) => handlePagerLayout(event.nativeEvent.layout.width)}
          >
            {showPager ? (
              <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                bounces={pageTotal > 1}
                style={styles.pagerScroll}
                onScroll={handleScroll}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScrollEndDrag={handleMomentumScrollEnd}
                onMomentumScrollEnd={handleMomentumScrollEnd}
              >
                {pagerContent}
              </ScrollView>
            ) : (
              pagerContent[0] ?? null
            )}
          </View>

          {showPager ? (
            <View style={styles.pageDots}>
              {items.map((item, index) => (
                <View
                  key={item.indent.id}
                  style={[styles.pageDot, index === safeIndex ? styles.pageDotActive : null]}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.footer}>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.laterBtnOutline}
                onPress={onLater}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Later"
                accessibilityHint="Hides this award for now and shows the next one in queue"
              >
                <Text style={styles.laterBtnOutlineText}>Later</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.assignBtn}
                onPress={onAssign}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Assign vehicle"
              >
                <LinearGradient
                  colors={[...FINANCE_SCORECARD_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.assignGradient}
                >
                  <Check size={14} color={Theme.textOnDark} strokeWidth={3} />
                  <Text style={styles.assignText}>Assign vehicle</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {onViewLoad ? (
              <TouchableOpacity
                onPress={onViewLoad}
                style={styles.viewLoadBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View load details"
              >
                <Text style={styles.viewLoadText}>View load</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});
