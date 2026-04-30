import { useLocalSearchParams } from 'expo-router';
import { SupplierDetailScreen } from '@/features/suppliers';
import { useSafeBack } from '@/lib/useSafeBack';

export default function SupplierDetailRoute() {
  const { id, profile, shared, sharedAction, tripId } = useLocalSearchParams<{
    id: string;
    profile?: string;
    shared?: string;
    sharedAction?: string;
    tripId?: string;
  }>();
  const safeBack = useSafeBack();
  const supplierId = typeof id === 'string' ? id : id?.[0] ?? '';
  const autoOpenProfile = profile === '1';
  const openSharedFromNotification = shared === '1';
  const notificationAction =
    typeof sharedAction === "string" ? sharedAction : undefined;
  const notificationTripId = typeof tripId === "string" ? tripId : undefined;

  return (
    <SupplierDetailScreen
      supplierId={supplierId}
      onBack={safeBack}
      autoOpenProfile={autoOpenProfile}
      openSharedFromNotification={openSharedFromNotification}
      notificationAction={notificationAction}
      notificationTripId={notificationTripId}
    />
  );
}
