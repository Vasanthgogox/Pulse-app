import { AppLoadingSplash } from '@/components/AppLoadingSplash';

/** Shown by Expo Router while a lazy route segment is loading. */
export default function RootLoading() {
  return <AppLoadingSplash variant="preparing" />;
}
