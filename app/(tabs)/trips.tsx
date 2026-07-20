import { MemberDomainGate } from '@/components/MemberDomainGate';
import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: TripsTab, preload: preloadTripsTabRoute } =
  createPreloadedTabRoute(() => import('@/features/trips/screens/TripsScreen'), 'trips');

function GatedTripsTab() {
  return (
    <MemberDomainGate kind="tripops">
      <TripsTab />
    </MemberDomainGate>
  );
}

export { preloadTripsTabRoute };
export default GatedTripsTab;
