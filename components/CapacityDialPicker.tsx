import { useCallback, useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";

const ITEM_H = 52;
const VISIBLE = 3; // compact: 1 above, selected, 1 below
const DIAL_H = ITEM_H * VISIBLE;
const PAD = 1; // padding rows each side = (VISIBLE-1)/2

// Common Indian truck tonnages
export const CAPACITY_VALUES: string[] = [
  "0.3", "0.5", "0.75", "1", "1.5", "2", "2.5", "3",
  "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7",
  "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11",
  "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "28", "30",
  "32", "35", "40", "45", "50",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function CapacityDialPicker({ value, onChange }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const lastIndex = useRef(-1);

  const resolvedValue = value && CAPACITY_VALUES.includes(value) ? value : CAPACITY_VALUES[0]!;

  const getIndex = (v: string) => {
    const idx = CAPACITY_VALUES.indexOf(v);
    return idx >= 0 ? idx : 0;
  };

  // Scroll to selected value on mount / external change
  useEffect(() => {
    const idx = getIndex(resolvedValue);
    if (idx === lastIndex.current) return;
    // Small timeout so the ScrollView has laid out
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: false });
    }, 50);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedValue]);

  // Fire onChange on mount if value was empty
  useEffect(() => {
    if (!value || !CAPACITY_VALUES.includes(value)) {
      onChange(CAPACITY_VALUES[0]!);
    }
  // only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScrollSettled = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      const idx = Math.max(0, Math.min(Math.round(y / ITEM_H), CAPACITY_VALUES.length - 1));
      lastIndex.current = idx;
      const picked = CAPACITY_VALUES[idx]!;
      if (picked !== value) onChange(picked);
    },
    [value, onChange],
  );

  return (
    <View style={styles.root}>
      {/* Selection highlight */}
      <View style={styles.selectorBar} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={onScrollSettled}
        onScrollEndDrag={onScrollSettled}
        contentContainerStyle={styles.content}
        bounces={false}
      >
        {/* Top pad */}
        {Array.from({ length: PAD }).map((_, i) => (
          <View key={`t${i}`} style={styles.padItem} />
        ))}

        {CAPACITY_VALUES.map((v) => {
          const active = v === resolvedValue;
          return (
            <View key={v} style={styles.item}>
              <Text style={[styles.label, active && styles.labelActive]}>
                {v}
              </Text>
              <Text style={[styles.unit, active && styles.unitActive]}>TON</Text>
            </View>
          );
        })}

        {/* Bottom pad */}
        {Array.from({ length: PAD }).map((_, i) => (
          <View key={`b${i}`} style={styles.padItem} />
        ))}
      </ScrollView>

      {/* Fade masks */}
      <View style={[styles.fade, styles.fadeTop]} pointerEvents="none" />
      <View style={[styles.fade, styles.fadeBot]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: DIAL_H,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: "center",
  },
  padItem: {
    height: ITEM_H,
  },
  item: {
    height: ITEM_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  label: {
    fontSize: 18,
    fontWeight: "500",
    color: Theme.textMuted,
    minWidth: 48,
    textAlign: "right",
  },
  labelActive: {
    fontSize: 26,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  unit: {
    fontSize: 11,
    fontWeight: "600",
    color: "transparent",
    letterSpacing: 0.4,
    minWidth: 28,
  },
  unitActive: {
    color: Theme.primary,
  },
  selectorBar: {
    position: "absolute",
    top: ITEM_H * PAD,
    left: 0,
    right: 0,
    height: ITEM_H,
    backgroundColor: Theme.surfaceLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    zIndex: 0,
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ITEM_H * 0.9,
    zIndex: 2,
  } as object,
  fadeTop: {
    top: 0,
    // @ts-ignore web only
    background: `linear-gradient(to bottom, ${Theme.cardWhite}ee, transparent)`,
  },
  fadeBot: {
    bottom: 0,
    // @ts-ignore web only
    background: `linear-gradient(to top, ${Theme.cardWhite}ee, transparent)`,
  },
});
