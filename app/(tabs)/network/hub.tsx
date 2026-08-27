import { MemberDomainGate } from '@/components/MemberDomainGate';
import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: NetworkHubTab } =
  createPreloadedTabRoute(() => import('@/features/network/screens/NetworkScreen'), 'network');

// Same screen as index.tsx (org hub vs classic feed within one Stack — see
// _layout.tsx) — must carry the identical domain gate. This file previously
// rendered NetworkHubTab bare, so a direct /network/hub URL bypassed the
// sales-domain check entirely even after index.tsx was gated.
function GatedNetworkHubTab() {
  return (
    <MemberDomainGate kind="sales">
      <NetworkHubTab />
    </MemberDomainGate>
  );
}

export default GatedNetworkHubTab;
