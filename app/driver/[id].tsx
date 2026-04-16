import { useLocalSearchParams } from 'expo-router';
import { DriverDetailScreen } from '@/features/drivers';
import { useSafeBack } from '@/lib/useSafeBack';

export default function DriverDetailRoute() {
  const { id, profile } = useLocalSearchParams<{ id: string; profile?: string }>();
  const safeBack = useSafeBack();
  const driverId = typeof id === 'string' ? id : id?.[0] ?? '';
  const autoOpenProfile = profile === '1';

  return (
    <DriverDetailScreen
      driverId={driverId}
      onBack={safeBack}
      autoOpenProfile={autoOpenProfile}
    />
  );
}
