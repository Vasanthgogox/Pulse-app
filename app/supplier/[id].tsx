import SupplierDetailScreen from '@/features/suppliers/components/SupplierDetailScreen';
import { useSafeBack } from '@/lib/useSafeBack';
import { useLocalSearchParams } from 'expo-router';

type DetailSubTab = 'trips' | 'cash' | 'shared';

function parseDetailSubTab(raw: string | undefined): DetailSubTab | undefined {
  if (raw === 'trips' || raw === 'cash' || raw === 'shared') return raw;
  return undefined;
}

export default function SupplierDetailRoute() {
  const { id, tab, profile, shared, sharedAction, tripId } = useLocalSearchParams<{
    id: string;
    tab?: string;
    profile?: string;
    shared?: string;
    sharedAction?: string;
    tripId?: string;
  }>();
  const safeBack = useSafeBack();
  const supplierId = typeof id === 'string' ? id : id?.[0] ?? '';
  const tabRaw = typeof tab === 'string' ? tab : tab?.[0];
  const autoOpenProfile = profile === '1';
  const openSharedFromNotification = shared === '1';
  const notificationAction =
    typeof sharedAction === 'string' ? sharedAction : undefined;
  const notificationTripId = typeof tripId === 'string' ? tripId : undefined;

  return (
    <SupplierDetailScreen
      supplierId={supplierId}
      onBack={safeBack}
      autoOpenProfile={autoOpenProfile}
      initialDetailSubTab={parseDetailSubTab(tabRaw)}
      openSharedFromNotification={openSharedFromNotification}
      notificationAction={notificationAction}
      notificationTripId={notificationTripId}
    />
  );
}
