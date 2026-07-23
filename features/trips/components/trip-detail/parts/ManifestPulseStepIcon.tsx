/**
 * Manifest Pulse step icon — matches reference (green check | purple ring | gray dot).
 * Extracted verbatim from TripDetailScreen.tsx (no behavior change).
 */
import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

export function ManifestPulseStepIcon({
  phase,
}: {
  phase: "completed" | "current" | "pending";
}) {
  if (phase === "completed") {
    return (
      <View style={manifestPulseStepStyles.completed}>
        <Check size={14} color="#FFFFFF" strokeWidth={3.5} />
      </View>
    );
  }
  if (phase === "current") {
    return (
      <View style={manifestPulseStepStyles.currentOuter}>
        <View style={manifestPulseStepStyles.currentInner}>
          <View style={manifestPulseStepStyles.currentDot} />
        </View>
      </View>
    );
  }
  return (
    <View style={manifestPulseStepStyles.pendingOuter}>
      <View style={manifestPulseStepStyles.pendingInner} />
    </View>
  );
}

const manifestPulseStepStyles = StyleSheet.create({
  completed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#40B876",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  currentOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 5,
    borderColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  currentInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#5856D6",
    alignItems: "center",
    justifyContent: "center",
  },
  currentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  pendingOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#CBD5E1",
  },
});
