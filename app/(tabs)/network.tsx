import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: NetworkTab, preload: preloadNetworkTabRoute } =
  createPreloadedTabRoute(() => import('@/features/network/screens/NetworkScreen'), 'network');

export { preloadNetworkTabRoute };
export default NetworkTab;
