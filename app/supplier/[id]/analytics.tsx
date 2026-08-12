import { ModelAccessGate } from "@/components/ModelAccessGate";
import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { useLocalSearchParams } from "expo-router";
import { SupplierAnalyticsFullScreen } from "@/features/suppliers/components/SupplierAnalyticsFullScreen";

export default function SupplierAnalyticsRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const supplierId =
    typeof id === "string" ? id : Array.isArray(id) ? id[0] ?? "" : "";

  return (
    <ModelAccessGate kind="suppliers">
      <SurfaceAccessGate surface="sales.suppliers.analytics">
        <SupplierAnalyticsFullScreen supplierId={supplierId} />
      </SurfaceAccessGate>
    </ModelAccessGate>
  );
}
