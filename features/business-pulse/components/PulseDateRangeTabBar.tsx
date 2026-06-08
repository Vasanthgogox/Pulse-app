import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  PULSE_DATE_RANGE_TABS,
  type TimePreset,
} from "@/features/business-pulse/lib/pulseCompare.util";
import { pulseEnterpriseStyles as ent } from "@/features/business-pulse/components/pulseEnterpriseStyles";

type Props = {
  active: TimePreset;
  onChange: (preset: TimePreset) => void;
};

export function PulseDateRangeTabBar({ active, onChange }: Props) {
  return (
    <View style={styles.shell}>
      <Text style={ent.filterRowLabel}>Date</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={ent.filterTrack}
        keyboardShouldPersistTaps="handled"
      >
        {PULSE_DATE_RANGE_TABS.map((tab) => {
          const selected = active === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={[ent.filterChip, selected && ent.filterChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[ent.filterChipText, selected && ent.filterChipTextActive]}
                numberOfLines={1}
              >
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
  scroll: {
    flex: 1,
    minWidth: 0,
  },
});
