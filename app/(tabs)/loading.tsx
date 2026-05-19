import { AppLoadingSplash } from '@/components/AppLoadingSplash';

/** Calm splash while tab screens (e.g. Finance) load their JS bundle. */
export default function TabsLoading() {
  return <AppLoadingSplash variant="preparing" />;
}
