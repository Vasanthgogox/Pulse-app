import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: NetworkHubTab } =
  createPreloadedTabRoute(() => import('@/features/network/screens/NetworkScreen'), 'network');

export default NetworkHubTab;
