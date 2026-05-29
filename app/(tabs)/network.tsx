import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: NetworkTab, preload: preloadNetworkTabRoute } =
  createPreloadedTabRoute(() => import('./_network-screen'), 'network');

export { preloadNetworkTabRoute };
export default NetworkTab;
