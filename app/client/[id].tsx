import { useLocalSearchParams } from 'expo-router';
import { ClientDetailScreen } from '@/features/clients';
import { useSafeBack } from '@/lib/useSafeBack';

export default function ClientDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeBack = useSafeBack();
  const clientId = typeof id === 'string' ? id : id?.[0] ?? '';

  return (
    <ClientDetailScreen
      clientId={clientId}
      onBack={safeBack}
    />
  );
}
