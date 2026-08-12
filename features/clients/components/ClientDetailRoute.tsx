import { SurfaceAccessGate } from '@/components/SurfaceAccessGate';
import ClientDetailScreen from '@/features/clients/components/ClientDetailScreen';
import { useLocalSearchParams } from 'expo-router';
import { useSafeBack } from '@/lib/useSafeBack';

/** Params + back handler for `/client/[id]` (loaded lazily from the route file). */
export default function ClientDetailRoute() {
  const { id, profile, tab } = useLocalSearchParams<{
    id: string;
    profile?: string;
    tab?: string;
  }>();
  const safeBack = useSafeBack();
  const clientId = typeof id === 'string' ? id : id?.[0] ?? '';
  const tabRaw = typeof tab === 'string' ? tab : tab?.[0];
  const initialDetailSubTab =
    tabRaw === 'trips' || tabRaw === 'cash' ? tabRaw : undefined;
  const autoOpenProfile = profile === '1';

  return (
    <SurfaceAccessGate surface="sales.clients.detail">
      <ClientDetailScreen
        clientId={clientId}
        onBack={safeBack}
        autoOpenProfile={autoOpenProfile}
        initialDetailSubTab={initialDetailSubTab}
      />
    </SurfaceAccessGate>
  );
}
