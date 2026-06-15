/**
 * Chat-filter tab row with aligned mirror indicators.
 * Selection = purple wash; hover preview = borderless white pill.
 */
import {
  CHAT_FILTER_ACTIVE_BG,
  CHAT_FILTER_MUTED,
  CHAT_FILTER_TRAY_BORDER,
  chatFilterChromeStyles as chrome,
} from "@/constants/ChatFilterChrome";
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const MOTION = {
  duration: 180,
  easing: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

const SEGMENT_H = 34;

const WEB_BOX =
  Platform.OS === "web"
    ? ({ boxSizing: "border-box" } as const)
    : ({} as const);

export type ChatFilterMirrorItem = {
  id: string;
  label: string;
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
};

type Props = {
  items: ChatFilterMirrorItem[];
  activeId: string;
  onSelect: (id: string) => void;
  style?: object;
};

export function ChatFilterMirrorToggle({ items, activeId, onSelect, style }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutsRef = useRef<Record<string, { pos: number; size: number }>>({});

  const activeX = useSharedValue(0);
  const activeW = useSharedValue(0);
  const hoverX = useSharedValue(0);
  const hoverW = useSharedValue(0);
  const hoverOpacity = useSharedValue(0);

  const previewingElsewhere = hoverId != null && hoverId !== activeId;

  const snapIndicator = (
    id: string,
    xSv: SharedValue<number>,
    wSv: SharedValue<number>,
  ) => {
    const layout = layoutsRef.current[id];
    if (!layout) return;
    xSv.value = withTiming(layout.pos, MOTION);
    wSv.value = withTiming(layout.size, MOTION);
  };

  useEffect(() => {
    snapIndicator(activeId, activeX, activeW);
  }, [activeId, activeX, activeW]);

  useEffect(() => {
    if (previewingElsewhere && hoverId) {
      snapIndicator(hoverId, hoverX, hoverW);
      hoverOpacity.value = withTiming(1, { duration: 140 });
      return;
    }
    hoverOpacity.value = withTiming(0, { duration: 100 });
  }, [hoverId, hoverOpacity, hoverW, hoverX, previewingElsewhere]);

  useEffect(
    () => () => {
      if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
    },
    [],
  );

  const onSegmentLayout = (id: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layoutsRef.current[id] = { pos: x, size: width };
    if (id === activeId) snapIndicator(activeId, activeX, activeW);
    if (id === hoverId) snapIndicator(hoverId, hoverX, hoverW);
  };

  const clearHoverSoon = () => {
    if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
    hoverClearRef.current = setTimeout(() => setHoverId(null), 60);
  };

  const activeThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: activeX.value }],
    width: activeW.value,
  }));

  const hoverThumbStyle = useAnimatedStyle(() => ({
    opacity: hoverOpacity.value,
    transform: [{ translateX: hoverX.value }],
    width: hoverW.value,
  }));

  return (
    <View
      style={[chrome.tabRow, style]}
      onHoverIn={() => {
        if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
      }}
      onHoverOut={clearHoverSoon}
    >
      <View style={styles.slot}>
        <Animated.View style={[styles.thumbActive, activeThumbStyle]} pointerEvents="none" />
        <Animated.View style={[styles.thumbHover, hoverThumbStyle]} pointerEvents="none" />
        <View style={styles.row}>
          {items.map((item) => {
            const selected = item.id === activeId;
            const hovered = item.id === hoverId;
            const showThumbUnder = selected || hovered;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
                  setHoverId(null);
                  onSelect(item.id);
                }}
                onHoverIn={() => {
                  if (hoverClearRef.current) clearTimeout(hoverClearRef.current);
                  setHoverId(item.id);
                }}
                onLayout={(e) => onSegmentLayout(item.id, e)}
                style={[
                  styles.segment,
                  !showThumbUnder && styles.segmentIdle,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                {item.icon ? (
                  <FontAwesome
                    name={item.icon}
                    size={12}
                    color={
                      selected || hovered
                        ? CHAT_FILTER_ACTIVE_BG
                        : CHAT_FILTER_MUTED
                    }
                  />
                ) : null}
                <Text
                  style={[
                    chrome.tabPillLabel,
                    (selected || hovered) && chrome.tabPillLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    height: SEGMENT_H,
    alignSelf: "stretch",
    ...WEB_BOX,
  },
  thumbActive: {
    position: "absolute",
    top: 0,
    left: 0,
    height: SEGMENT_H,
    borderRadius: 999,
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 1,
    borderColor: CHAT_FILTER_ACTIVE_BG,
    zIndex: 0,
    ...WEB_BOX,
  },
  thumbHover: {
    position: "absolute",
    top: 0,
    left: 0,
    height: SEGMENT_H,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    zIndex: 1,
    shadowColor: "#94A3B8",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    ...WEB_BOX,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: SEGMENT_H,
    zIndex: 2,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    height: SEGMENT_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "transparent",
    ...WEB_BOX,
  },
  segmentIdle: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: CHAT_FILTER_TRAY_BORDER,
  },
});
