import { ClientProfileScreen } from '@/features/clients/components/ClientProfileScreen';
import { ROUTES } from '@/lib/routes';
import { useSafeBack } from '@/lib/useSafeBack';
import { Redirect, useLocalSearchParams } from 'expo-router';

/** Customer management hub — `/party/customers/[id]` */
export default function CustomerProfileRoute() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const safeBack = useSafeBack();
  const clientId = typeof id === 'string' ? id : id?.[0] ?? '';
  const initialTab = typeof tab === 'string' ? tab : undefined;

  if (!clientId) {
    return <Redirect href={ROUTES.partyDirectory('customers')} />;
  }

  return (
    <ClientProfileScreen
      clientId={clientId}
      initialTab={initialTab}
      onBack={safeBack}
    />
  );
}
