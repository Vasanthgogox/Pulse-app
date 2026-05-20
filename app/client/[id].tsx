import { LazyRouteScreen } from '@/components/LazyRouteScreen';

/**
 * Client detail — lazy bundle (ClientDetailScreen + finance/trips/ledger deps).
 */
export default function ClientDetailRoute() {
  return (
    <LazyRouteScreen
      loader={() =>
        import('@/features/clients/components/ClientDetailRoute').then((m) => ({
          default: m.default,
        }))
      }
      message="Loading client…"
    />
  );
}
