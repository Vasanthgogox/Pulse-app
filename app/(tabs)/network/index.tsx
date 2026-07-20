import { MemberDomainGate } from '@/components/MemberDomainGate';
import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: NetworkTab, preload: preloadNetworkTabRoute } =
  createPreloadedTabRoute(() => import('@/features/network/screens/NetworkScreen'), 'network');

function GatedNetworkTab() {
  return (
    <MemberDomainGate kind="sales">
      <NetworkTab />
    </MemberDomainGate>
  );
}

export { preloadNetworkTabRoute };
export default GatedNetworkTab;
