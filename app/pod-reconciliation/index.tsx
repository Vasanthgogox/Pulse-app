import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { PodReconciliationScreen } from "@/features/pod-reconciliation/PodReconciliationScreen";

export default function PodReconciliationRoute() {
  return (
    <SurfaceAccessGate surface="finance.pod_reconciliation">
      <PodReconciliationScreen />
    </SurfaceAccessGate>
  );
}
