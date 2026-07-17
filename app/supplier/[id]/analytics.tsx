import { ModelAccessGate } from "@/components/ModelAccessGate";
import { useLocalSearchParams } from "expo-router";
import { SupplierAnalyticsFullScreen } from "@/features/suppliers/components/SupplierAnalyticsFullScreen";

export default function SupplierAnalyticsRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const supplierId =
    typeof id === "string" ? id : Array.isArray(id) ? id[0] ?? "" : "";

  return (
    <ModelAccessGate kind="suppliers">
      <SupplierAnalyticsFullScreen supplierId={supplierId} />
    </ModelAccessGate>
  );
}
