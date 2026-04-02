import { useLocalSearchParams } from 'expo-router';
import { VehicleDetailScreen } from '@/features/vehicles';
import { useSafeBack } from '@/lib/useSafeBack';

export default function VehicleDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeBack = useSafeBack();
  const vehicleId = typeof id === 'string' ? id : id?.[0] ?? '';

  return (
    <VehicleDetailScreen
      vehicleId={vehicleId}
      onBack={safeBack}
    />
  );
}
