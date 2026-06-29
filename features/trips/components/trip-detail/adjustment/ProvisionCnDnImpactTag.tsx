import { StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import {
  getProvisionCnDnImpactTag,
  getProvisionCnDnImpactTagTone,
  type ProvisionCnDnImpactParams,
} from "@/features/trips/components/trip-detail/adjustment/provisionCnDnImpact.util";

export function ProvisionCnDnImpactTag(params: ProvisionCnDnImpactParams) {
  const label = getProvisionCnDnImpactTag(params);
  const tone = getProvisionCnDnImpactTagTone(params);
  const positive = tone === "positive";

  return (
    <View
      style={[
        styles.tag,
        positive ? styles.tagPositive : styles.tagNegative,
      ]}
    >
      <Text
        style={[
          styles.tagText,
          positive ? styles.tagTextPositive : styles.tagTextNegative,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "100%",
  },
  tagPositive: {
    backgroundColor: "rgba(16,185,129,0.1)",
    borderColor: "rgba(16,185,129,0.28)",
  },
  tagNegative: {
    backgroundColor: "rgba(244,63,94,0.08)",
    borderColor: "rgba(244,63,94,0.24)",
  },
  tagText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  tagTextPositive: {
    color: Theme.darkGreen,
  },
  tagTextNegative: {
    color: Theme.teslaRed,
  },
});
