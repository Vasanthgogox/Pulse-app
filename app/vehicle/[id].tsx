import { useLocalSearchParams } from 'expo-router';
import { VehicleDetailScreen } from '@/features/vehicles';
import { useSafeBack } from '@/lib/useSafeBack';

export default function VehicleDetailRoute() {
  const { id, openAddEntry, tripId } = useLocalSearchParams<{
    id: string;
    openAddEntry?: string;
    tripId?: string;
  }>();
  const safeBack = useSafeBack();
  const vehicleId = typeof id === 'string' ? id : id?.[0] ?? '';
  const shouldOpenAddEntry = openAddEntry === '1';
  const initialLedgerTripId = typeof tripId === 'string' ? tripId : undefined;

  return (
    <VehicleDetailScreen
      vehicleId={vehicleId}
      onBack={safeBack}
      openAddEntryOnLoad={shouldOpenAddEntry}
      initialLedgerTripId={initialLedgerTripId}
    />
  );
}
