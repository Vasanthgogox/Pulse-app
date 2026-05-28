import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import {
  PULSE_DATE_RANGE_TABS,
  type TimePreset,
} from "@/features/business-pulse/lib/pulseCompare.util";

type Props = {
  active: TimePreset;
  onChange: (preset: TimePreset) => void;
};

export function PulseDateRangeTabBar({ active, onChange }: Props) {
  return (
    <View style={styles.shell}>
      <Text style={styles.label}>Date</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {PULSE_DATE_RANGE_TABS.map((tab) => {
          const selected = active === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={[styles.tab, selected && styles.tabActive]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  label: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    width: 48,
    flexShrink: 0,
  },
  scroll: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 3,
    paddingRight: 8,
  },
  tab: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 7,
    paddingHorizontal: 12,
    minHeight: 34,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.surface,
  },
  tabActive: {
    backgroundColor: "#eef2ff",
    borderColor: Theme.primary,
  },
  tabText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.text,
  },
  tabTextActive: {
    color: Theme.primary,
    fontWeight: "800",
  },
});
