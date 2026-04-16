import { useLocalSearchParams } from 'expo-router';
import { ClientDetailScreen } from '@/features/clients';
import { useSafeBack } from '@/lib/useSafeBack';

export default function ClientDetailRoute() {
  const { id, profile } = useLocalSearchParams<{ id: string; profile?: string }>();
  const safeBack = useSafeBack();
  const clientId = typeof id === 'string' ? id : id?.[0] ?? '';
  const autoOpenProfile = profile === '1';

  return (
    <ClientDetailScreen
      clientId={clientId}
      onBack={safeBack}
      autoOpenProfile={autoOpenProfile}
    />
  );
}
