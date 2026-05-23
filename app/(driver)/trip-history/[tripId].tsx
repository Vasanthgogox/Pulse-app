import { DriverTripHistoryDetailScreen } from "@/features/driver/components/DriverTripHistoryDetailScreen";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

export default function TripHistoryDetailPage() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const id = typeof tripId === "string" ? tripId : Array.isArray(tripId) ? tripId[0] : "";
  if (!id) {
    return <View />;
  }
  return <DriverTripHistoryDetailScreen tripId={id} />;
}
