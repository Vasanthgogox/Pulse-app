import { VehicleProfileScreen } from "@/features/vehicles/components/VehicleProfileScreen";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams } from "expo-router";

export default function VehicleProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeBack = useSafeBack();
  const vehicleId = typeof id === "string" ? id : id?.[0] ?? "";
  return <VehicleProfileScreen vehicleId={vehicleId} onBack={safeBack} />;
}
