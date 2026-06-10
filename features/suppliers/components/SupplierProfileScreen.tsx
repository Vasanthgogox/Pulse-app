import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ContentErrorState } from "@/components/ContentErrorState";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { SupplierProfileHub } from "@/features/suppliers/components/desktop/SupplierProfileHub";
import { getSupplierById } from "@/features/suppliers/services/suppliers.service";
import { buildDefaultBundle } from "@/features/suppliers/types/supplierManagement.types";
import { getDriversByOrganization } from "@/features/drivers/services/drivers.service";
import { getTripsForOrg } from "@/features/trips/services/trips.service";
import { getTransactionsByOrganization } from "@/features/finance/services/finance.service";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SupplierManagementBundle } from "@/features/suppliers/types/supplierManagement.types";

type Props = {
  supplierId: string;
  onBack: () => void;
};

export function SupplierProfileScreen({ supplierId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<SupplierManagementBundle | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !supplierId) return;
    setLoading(true);
    setError(null);
    try {
      const [supplierRes, tripsRes, txRes, driversRes] = await Promise.all([
        getSupplierById(orgId, supplierId),
        getTripsForOrg(orgId),
        getTransactionsByOrganization(orgId),
        getDriversByOrganization(orgId),
      ]);
      if (supplierRes.error || !supplierRes.supplier) {
        throw supplierRes.error ?? new Error("Supplier not found");
      }
      const supplierTrips = (tripsRes.trips ?? []).filter(
        (t) => t.supplier_id === supplierId,
      );
      setBundle(
        buildDefaultBundle(
          supplierRes.supplier,
          supplierTrips,
          txRes.transactions ?? [],
          driversRes.drivers ?? [],
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load supplier");
    } finally {
      setLoading(false);
    }
  }, [orgId, supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!orgId || loading) return <CenteredLoadingView />;
  if (error || !bundle) {
    return (
      <ContentErrorState variant="generic" message={error ?? "Supplier not found"} onRetry={() => void load()} />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Theme.screenBackground, paddingTop: insets.top }}>
      <SupplierProfileHub bundle={bundle} onBack={onBack} onRefresh={() => void load()} />
    </View>
  );
}
