/**
 * Route: /from-clients — "From Your Clients" feed (distributed bookkeeping).
 * Screen implementation lives in features/client-feed.
 */
import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import ClientFeedScreen from "@/features/client-feed/components/ClientFeedScreen";

export default function FromClientsRoute() {
  return (
    <SurfaceAccessGate surface="sales.from_clients">
      <ClientFeedScreen />
    </SurfaceAccessGate>
  );
}
