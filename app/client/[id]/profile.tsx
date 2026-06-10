import { ClientProfileScreen } from '@/features/clients/components/ClientProfileScreen';
import { useLocalSearchParams } from 'expo-router';
import { useSafeBack } from '@/lib/useSafeBack';

/** Metronic client profile hub — `/client/[id]/profile` */
export default function ClientProfileRoute() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const safeBack = useSafeBack();
  const clientId = typeof id === 'string' ? id : id?.[0] ?? '';
  const initialTab = typeof tab === 'string' ? tab : undefined;

  return (
    <ClientProfileScreen
      clientId={clientId}
      initialTab={initialTab}
      onBack={safeBack}
    />
  );
}
