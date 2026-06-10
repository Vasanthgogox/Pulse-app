import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ContentErrorState } from "@/components/ContentErrorState";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getTripsForOrg } from "@/features/trips/services/trips.service";
import { VehicleProfileHub } from "@/features/vehicles/components/desktop/VehicleProfileHub";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  vehicleId: string;
  onBack: () => void;
};

export function VehicleProfileScreen({ vehicleId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [tripCount, setTripCount] = useState(0);

  const load = useCallback(async () => {
    if (!orgId || !vehicleId) return;
    setLoading(true);
    setError(null);
    try {
      const [vehicleRes, tripsRes] = await Promise.all([
        getVehicleById(orgId, vehicleId),
        getTripsForOrg(orgId),
      ]);
      if (vehicleRes.error || !vehicleRes.vehicle) {
        throw vehicleRes.error ?? new Error("Vehicle not found");
      }
      setVehicle(vehicleRes.vehicle);
      const trips = (tripsRes.trips ?? []).filter((t) => t.vehicle_id === vehicleId);
      setTripCount(trips.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vehicle");
    } finally {
      setLoading(false);
    }
  }, [orgId, vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!orgId || loading) return <CenteredLoadingView />;
  if (error || !vehicle) {
    return (
      <ContentErrorState variant="generic" message={error ?? "Vehicle not found"} onRetry={() => void load()} />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Theme.screenBackground, paddingTop: insets.top }}>
      <VehicleProfileHub vehicle={vehicle} tripCount={tripCount} onBack={onBack} />
    </View>
  );
}
