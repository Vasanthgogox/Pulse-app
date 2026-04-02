import { useLocalSearchParams } from 'expo-router';
import { DriverDetailScreen } from '@/features/drivers';
import { useSafeBack } from '@/lib/useSafeBack';

export default function DriverDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeBack = useSafeBack();
  const driverId = typeof id === 'string' ? id : id?.[0] ?? '';

  return (
    <DriverDetailScreen
      driverId={driverId}
      onBack={safeBack}
    />
  );
}
