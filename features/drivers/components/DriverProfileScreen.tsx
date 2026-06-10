import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ContentErrorState } from "@/components/ContentErrorState";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { DriverProfileHub } from "@/features/drivers/components/desktop/DriverProfileHub";
import {
  getDriverDetailBundle,
  getDriverTenures,
} from "@/features/drivers/services/drivers.service";
import { getTripsForOrg } from "@/features/trips/services/trips.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  driverId: string;
  onBack: () => void;
};

export function DriverProfileScreen({ driverId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tripCount, setTripCount] = useState(0);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [tenureCount, setTenureCount] = useState(0);
  const [driver, setDriver] = useState<Awaited<
    ReturnType<typeof getDriverDetailBundle>
  >["driver"]>(null);

  const load = useCallback(async () => {
    if (!orgId || !driverId) return;
    setLoading(true);
    setError(null);
    try {
      const [bundleRes, tripsRes, tenuresRes] = await Promise.all([
        getDriverDetailBundle(orgId, driverId),
        getTripsForOrg(orgId),
        getDriverTenures(orgId, driverId),
      ]);
      if (bundleRes.error || !bundleRes.driver) {
        throw bundleRes.error ?? new Error("Driver not found");
      }
      setDriver(bundleRes.driver);
      setRatingCount(bundleRes.ratings?.length ?? 0);
      const trips = (tripsRes.trips ?? []).filter((t) => t.driver_id === driverId);
      setTripCount(trips.length);
      setTenureCount(tenuresRes.tenures?.length ?? 0);
      const vehicleId = bundleRes.driver.assigned_vehicle_id;
      if (vehicleId) {
        const vehicleRes = await getVehicleById(orgId, vehicleId);
        setVehicleLabel(vehicleRes.vehicle?.vehicle_number ?? null);
      } else {
        setVehicleLabel(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load driver");
    } finally {
      setLoading(false);
    }
  }, [driverId, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!orgId || loading) return <CenteredLoadingView />;
  if (error || !driver) {
    return (
      <ContentErrorState variant="generic" message={error ?? "Driver not found"} onRetry={() => void load()} />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Theme.screenBackground, paddingTop: insets.top }}>
      <DriverProfileHub
        driver={driver}
        tripCount={tripCount}
        vehicleLabel={vehicleLabel}
        ratingCount={ratingCount}
        tenureCount={tenureCount}
        onBack={onBack}
      />
    </View>
  );
}
