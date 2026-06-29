import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import type { TripAuditLogCategory } from "@/lib/trips/tripAuditLog.types";
import { TRIP_ACTIVITY_LOTTIE } from "@/lib/trips/tripActivityLottieAssets";
import { StyleSheet, View } from "react-native";

function lottieForCategory(
  category: TripAuditLogCategory,
  title: string,
  amountLabel?: string,
): object {
  const lower = title.toLowerCase();
  if (category === "payment") {
    return amountLabel?.startsWith("+")
      ? TRIP_ACTIVITY_LOTTIE.paymentIn
      : TRIP_ACTIVITY_LOTTIE.payment;
  }
  if (category === "assignment") {
    if (lower.includes("reject") || lower.includes("declin")) {
      return TRIP_ACTIVITY_LOTTIE.rejected;
    }
    if (lower.includes("reassign")) {
      return TRIP_ACTIVITY_LOTTIE.reassignment;
    }
    return TRIP_ACTIVITY_LOTTIE.assignment;
  }
  if (category === "trip") return TRIP_ACTIVITY_LOTTIE.created;
  if (lower.includes("accept")) return TRIP_ACTIVITY_LOTTIE.accepted;
  if (lower.includes("pickup") || lower.includes("picked")) {
    return TRIP_ACTIVITY_LOTTIE.statusPickup;
  }
  if (lower.includes("drop") || lower.includes("destination")) {
    return TRIP_ACTIVITY_LOTTIE.statusDrop;
  }
  if (lower.includes("transit") || lower.includes("started") || lower.includes("depart")) {
    return TRIP_ACTIVITY_LOTTIE.statusTransit;
  }
  if (lower.includes("complete") || lower.includes("deliver")) {
    return TRIP_ACTIVITY_LOTTIE.status;
  }
  return TRIP_ACTIVITY_LOTTIE.status;
}

/** Minimal Metronic timeline node — white circle, gray rim, tiny Lottie. */
export function TripActivityTimelineIcon({
  category,
  title,
  amountLabel,
  size = 28,
}: {
  category: TripAuditLogCategory;
  title: string;
  amountLabel?: string;
  size?: number;
}) {
  const lottieSize = Math.round(size * 0.52);

  return (
    <View
      style={[
        styles.node,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <TinyEmptyLottie
        source={lottieForCategory(category, title, amountLabel)}
        size={lottieSize}
        speed={0.82}
        renderScale={1.35}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  node: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4E6EF",
    zIndex: 2,
    overflow: "hidden",
  },
});
