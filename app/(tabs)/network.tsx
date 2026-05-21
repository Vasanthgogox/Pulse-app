import { LazySuspenseNullFallback } from "@/components/LazySuspenseFallback";
import { lazy, Suspense } from "react";

const NetworkScreen = lazy(() => import("./_network-screen"));

export default function NetworkTab() {
  return (
    <Suspense fallback={<LazySuspenseNullFallback />}>
      <NetworkScreen />
    </Suspense>
  );
}
