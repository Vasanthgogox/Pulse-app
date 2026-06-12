/**
 * Desktop web header nav — layout-driven mirror toggle (Q-unified-base / ChatSlack pattern).
 * One sliding thumb follows measured segment bounds; labels expand on the active slot.
 */
import Theme from "@/constants/Theme";
import { useMirrorIndicator } from "@/lib/hooks/useMirrorIndicator";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

const PADDING = 6;
const GAP = 6;
const ICON_W = 44;
const ACTIVE_MIN_W = 160;
const HEIGHT = 44;

const LABEL_FADE_IN = { duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true } as const;
const LABEL_FADE_OUT = { duration: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true } as const;

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

function WebNavMirrorSegment({
  item,
  active,
  onPress,
  onWarm,
  onLayout,
}: {
  item: WebNavMirrorItem;
  active: boolean;
  onPress: () => void;
  onWarm?: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const labelOpacity = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(labelOpacity, {
      toValue: active ? 1 : 0,
      ...(active ? LABEL_FADE_IN : LABEL_FADE_OUT),
    }).start();
  }, [active, labelOpacity]);

  const labelStyle = {
    opacity: labelOpacity,
    transform: [
      {
        translateX: labelOpacity.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 0],
        }),
      },
    ],
  };

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onWarm}
      onLayout={onLayout}
      style={[styles.segmentPressable, active && styles.segmentPressableActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.segment, active && styles.segmentActive]}>
        <View style={styles.iconBox}>
          <FontAwesome5
            name={item.icon}
            size={16}
            color={active ? Theme.textOnPrimary : Theme.textMutedDemo}
            solid={active}
          />
        </View>
        {active ? (
          <Animated.View style={[styles.labelWrap, labelStyle]} pointerEvents="none">
            <Text numberOfLines={1} style={styles.titleActive}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text numberOfLines={1} style={styles.subtitleActive}>
                {item.subtitle}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function WebNavMirrorToggle({
  items,
  activeIndex,
  onSelect,
  onWarmAt,
}: Props) {
  const activeId = items[activeIndex]?.id ?? items[0]?.id ?? "";
  const { translate, indicatorSize, onItemLayout } = useMirrorIndicator(activeId, "x");

  const thumbStyle = {
    transform: [{ translateX: translate }],
    width: indicatorSize > 0 ? indicatorSize : 0,
    opacity: indicatorSize > 0 ? 1 : 0,
  };

  return (
    <View style={styles.track}>
      <Animated.View
        style={[styles.thumb, thumbStyle]}
        pointerEvents="none"
      />
      {items.map((item, index) => (
        <WebNavMirrorSegment
          key={item.id}
          item={item}
          active={index === activeIndex}
          onPress={() => onSelect(index)}
          onWarm={() => onWarmAt?.(index)}
          onLayout={(e) => onItemLayout(item.id, e)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: GAP,
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
  segmentPressable: {
    flexShrink: 0,
    zIndex: 1,
  },
  segmentPressableActive: {
    zIndex: 2,
  },
  segment: {
    height: HEIGHT,
    width: ICON_W,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  segmentActive: {
    width: undefined,
    minWidth: ACTIVE_MIN_W,
    paddingRight: 10,
  },
  iconBox: {
    width: ICON_W,
    height: HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  labelWrap: {
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: 4,
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
