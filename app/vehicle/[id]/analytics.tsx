import { ModelAccessGate } from "@/components/ModelAccessGate";
import { useLocalSearchParams } from "expo-router";
import { VehicleAnalyticsFullScreen } from "@/features/vehicles/components/VehicleAnalyticsFullScreen";

export default function VehicleAnalyticsRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const vehicleId =
    typeof id === "string" ? id : Array.isArray(id) ? id[0] ?? "" : "";

  return (
    <ModelAccessGate kind="vehicles">
      <VehicleAnalyticsFullScreen vehicleId={vehicleId} />
    </ModelAccessGate>
  );
}
