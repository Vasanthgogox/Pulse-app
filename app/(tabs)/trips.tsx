import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: TripsTab, preload: preloadTripsTabRoute } =
  createPreloadedTabRoute(() => import('@/features/trips/screens/TripsScreen'), 'trips');

export { preloadTripsTabRoute };
export default TripsTab;
