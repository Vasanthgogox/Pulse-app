import { useLocalSearchParams } from 'expo-router';
import { TripDetailScreen } from '@/features/trips';
import { useSafeBack } from '@/lib/useSafeBack';

export default function TripDetailRoute() {
  const raw = useLocalSearchParams<{
    id: string;
    entryContext?: string;
    clientIdFromContext?: string;
    clientNameFromContext?: string;
  }>();
  const safeBack = useSafeBack();
  const tripId = typeof raw.id === 'string' ? raw.id : raw.id?.[0] ?? '';
  const entryContext =
    typeof raw.entryContext === 'string' &&
    (raw.entryContext === 'supplier' ||
      raw.entryContext === 'vehicle' ||
      raw.entryContext === 'client')
      ? (raw.entryContext as 'supplier' | 'vehicle' | 'client')
      : undefined;
  const clientIdFromContext =
    typeof raw.clientIdFromContext === 'string'
      ? raw.clientIdFromContext
      : undefined;
  const clientNameFromContext =
    typeof raw.clientNameFromContext === 'string'
      ? raw.clientNameFromContext
      : undefined;

  return (
    <TripDetailScreen
      tripId={tripId}
      entryContext={entryContext}
      clientIdFromContext={clientIdFromContext}
      clientNameFromContext={clientNameFromContext}
      onBack={safeBack}
    />
  );
}
