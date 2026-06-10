/**
 * Desktop web header nav — Slack-style mirror toggle.
 * One sliding thumb; segment widths morph; labels fade on the active slot.
 */
import Theme from "@/constants/Theme";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const PADDING = 6;
const GAP = 6;
const INACTIVE_W = 44;
const ACTIVE_W = 160;
const HEIGHT = 44;

const MIRROR_MOTION = {
  duration: 240,
  easing: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

export type WebNavMirrorItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentProps<typeof FontAwesome5>["name"];
};

type Props = {
  items: WebNavMirrorItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onWarmAt?: (index: number) => void;
};

function thumbOffsetForIndex(index: number): number {
  let x = PADDING;
  for (let i = 0; i < index; i += 1) {
    x += INACTIVE_W + GAP;
  }
  return x;
}

function WebNavMirrorSegment({
  item,
  active,
  onPress,
  onWarm,
}: {
  item: WebNavMirrorItem;
  active: boolean;
  onPress: () => void;
  onWarm?: () => void;
}) {
  const widthSV = useSharedValue(active ? ACTIVE_W : INACTIVE_W);
  const labelOpacity = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    widthSV.value = withTiming(active ? ACTIVE_W : INACTIVE_W, MIRROR_MOTION);
    labelOpacity.value = withTiming(active ? 1 : 0, {
      ...MIRROR_MOTION,
      duration: active ? 200 : 120,
    });
  }, [active, labelOpacity, widthSV]);

  const segmentStyle = useAnimatedStyle(() => ({
    width: widthSV.value,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateX: (1 - labelOpacity.value) * -8 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onWarm}
      style={styles.segmentPressable}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Animated.View style={[styles.segment, segmentStyle]}>
        <View style={styles.iconBox}>
          <FontAwesome5
            name={item.icon}
            size={16}
            color={active ? Theme.textOnPrimary : Theme.textMutedDemo}
            solid={active}
          />
        </View>
        <Animated.View
          style={[styles.labelWrap, labelStyle]}
          pointerEvents="none"
        >
          <Text numberOfLines={1} style={styles.titleActive}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text numberOfLines={1} style={styles.subtitleActive}>
              {item.subtitle}
            </Text>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function WebNavMirrorToggle({
  items,
  activeIndex,
  onSelect,
  onWarmAt,
}: Props) {
  const activeIndexSV = useSharedValue(activeIndex);
  const thumbX = useSharedValue(thumbOffsetForIndex(activeIndex));
  const thumbW = useSharedValue(ACTIVE_W);

  useEffect(() => {
    activeIndexSV.value = activeIndex;
  }, [activeIndex, activeIndexSV]);

  useAnimatedReaction(
    () => activeIndexSV.value,
    (idx, prev) => {
      if (idx === prev) return;
      thumbX.value = withTiming(thumbOffsetForIndex(idx), MIRROR_MOTION);
      thumbW.value = withTiming(ACTIVE_W, MIRROR_MOTION);
    },
    [activeIndex],
  );

  useEffect(() => {
    thumbX.value = thumbOffsetForIndex(activeIndex);
    thumbW.value = ACTIVE_W;
  }, []);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
    width: thumbW.value,
  }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />
      <View style={styles.row}>
        {items.map((item, index) => (
          <WebNavMirrorSegment
            key={item.id}
            item={item}
            active={index === activeIndex}
            onPress={() => onSelect(index)}
            onWarm={() => onWarmAt?.(index)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: "relative",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.6)",
    borderRadius: 999,
    padding: PADDING,
    minWidth: 0,
    maxWidth: 520,
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    top: PADDING,
    left: 0,
    height: HEIGHT,
    borderRadius: 999,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.65)",
    zIndex: 0,
    shadowColor: "#4C1D95",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: GAP,
    zIndex: 1,
  },
  segmentPressable: {
    flexShrink: 0,
  },
  segment: {
    height: HEIGHT,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  iconBox: {
    width: INACTIVE_W,
    height: HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    zIndex: 2,
  },
  labelWrap: {
    position: "absolute",
    left: INACTIVE_W,
    top: 0,
    bottom: 0,
    width: ACTIVE_W - INACTIVE_W,
    justifyContent: "center",
    paddingRight: 8,
    zIndex: 1,
  },
  titleActive: {
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  subtitleActive: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: "#C4B5FD",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
});
