import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: TripsTab, preload: preloadTripsTabRoute } =
  createPreloadedTabRoute(() => import('./_trips-screen'), 'trips');

export { preloadTripsTabRoute };
export default TripsTab;
