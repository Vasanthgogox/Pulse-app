import { ModelAccessGate } from "@/components/ModelAccessGate";
import { SupplierProfileScreen } from "@/features/suppliers/components/SupplierProfileScreen";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams } from "expo-router";

export default function SupplierProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeBack = useSafeBack();
  const supplierId = typeof id === "string" ? id : id?.[0] ?? "";
  return (
    <ModelAccessGate kind="suppliers">
      <SupplierProfileScreen supplierId={supplierId} onBack={safeBack} />
    </ModelAccessGate>
  );
}
