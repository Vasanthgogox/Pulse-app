import ClientDetailScreen from '@/features/clients/components/ClientDetailScreen';
import { useLocalSearchParams } from 'expo-router';
import { useSafeBack } from '@/lib/useSafeBack';

/** Params + back handler for `/client/[id]` (loaded lazily from the route file). */
export default function ClientDetailRoute() {
  const { id, profile, shared, sharedAction, tripId, tab } = useLocalSearchParams<{
    id: string;
    profile?: string;
    shared?: string;
    sharedAction?: string;
    tripId?: string;
    tab?: string;
  }>();
  const safeBack = useSafeBack();
  const clientId = typeof id === 'string' ? id : id?.[0] ?? '';
  const tabRaw = typeof tab === 'string' ? tab : tab?.[0];
  const initialDetailSubTab =
    tabRaw === 'trips' || tabRaw === 'cash' || tabRaw === 'shared'
      ? tabRaw
      : undefined;
  const autoOpenProfile = profile === '1';
  const openSharedFromNotification = shared === '1';
  const notificationAction =
    typeof sharedAction === 'string' ? sharedAction : undefined;
  const notificationTripId = typeof tripId === 'string' ? tripId : undefined;

  return (
    <ClientDetailScreen
      clientId={clientId}
      onBack={safeBack}
      autoOpenProfile={autoOpenProfile}
      initialDetailSubTab={initialDetailSubTab}
      openSharedFromNotification={openSharedFromNotification}
      notificationAction={notificationAction}
      notificationTripId={notificationTripId}
    />
  );
}
