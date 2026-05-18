/**
 * Realtime invalidation for Grow your network / discover list.
 * One shared channel per org; debounced refetch to stay under ~2s freshness.
 */
import { useEffect, useRef } from 'react';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import { clearDiscoveryCache } from '@/features/network/lib/discoveryCache';

const INVALIDATE_DEBOUNCE_MS = 400;

export function useRealtimeDiscoverInvalidation(
  orgId: string | null,
  onInvalidate: () => void,
): void {
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!orgId) return;

    const scheduleInvalidate = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        clearDiscoveryCache(orgId);
        onInvalidateRef.current();
      }, INVALIDATE_DEBOUNCE_MS);
    };

    const unsubscribe = subscribeSharedPostgresChanges(
      `discover:org:${orgId}`,
      [
        { event: '*', schema: 'public', table: 'organizations' },
        {
          event: '*',
          schema: 'public',
          table: 'connection_requests',
          filter: `from_organization_id=eq.${orgId}`,
        },
        {
          event: '*',
          schema: 'public',
          table: 'connection_requests',
          filter: `to_organization_id=eq.${orgId}`,
        },
        {
          event: '*',
          schema: 'public', table: 'indents',
          filter: `organization_id=eq.${orgId}`,
        },
        { event: '*', schema: 'public', table: 'posts' },
        {
          event: '*',
          schema: 'public', table: 'ratings',
          filter: `organization_id=eq.${orgId}`,
        },
        {
          event: '*',
          schema: 'public', table: 'clients',
          filter: `organization_id=eq.${orgId}`,
        },
        {
          event: '*',
          schema: 'public', table: 'suppliers',
          filter: `organization_id=eq.${orgId}`,
        },
      ],
      () => scheduleInvalidate(),
    );

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubscribe();
    };
  }, [orgId]);
}
